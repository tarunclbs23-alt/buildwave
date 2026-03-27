/**
 * Pipeline Engine — Parses Jenkinsfile.yaml and executes stages as a DAG.
 * 
 * Four sub-components:
 *   1. Repo Resolver  — Finds the Jenkinsfile.yaml for a given repo
 *   2. YAML Parser    — Reads YAML into an AST
 *   3. DAG Builder    — Converts AST into an execution graph
 *   4. DAG Walker     — State machine that executes stages with simulated delays
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const eventBus = require('./eventBus');

// ─── 1. Repo Resolver ──────────────────────────────────────────────

const JENKINSFILES_DIR = path.join(__dirname, '..', 'jenkinsfiles');

/**
 * Find the Jenkinsfile.yaml for a given repo.
 * Looks in: backend/jenkinsfiles/{repoName}/Jenkinsfile.yaml
 * @param {string} repoName 
 * @returns {string|null} File path or null
 */
function resolveJenkinsfile(repoName) {
  const filePath = path.join(JENKINSFILES_DIR, repoName, 'Jenkinsfile.yaml');
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  console.warn(`[Pipeline] No Jenkinsfile found for repo: ${repoName} at ${filePath}`);
  return null;
}

// ─── 2. YAML Parser ────────────────────────────────────────────────

/**
 * Parse a Jenkinsfile.yaml into a structured AST.
 * @param {string} filePath 
 * @returns {object} Parsed pipeline config
 */
function parseJenkinsfile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(raw);

  if (!config || !config.pipeline || !config.pipeline.stages) {
    throw new Error(`Invalid Jenkinsfile: missing pipeline.stages`);
  }

  return config.pipeline;
}

// ─── 3. DAG Builder ─────────────────────────────────────────────────

/**
 * Convert the parsed AST into a flat list of stage nodes with dependency info.
 * Handles sequential stages and parallel groups.
 * 
 * @param {object} pipeline - Parsed pipeline config
 * @param {string} branch - Current branch (for `when` evaluation)
 * @returns {Array<object>} Array of stage nodes
 */
function buildDAG(pipeline, branch) {
  const nodes = [];
  let stageIndex = 0;
  let prevNodeNames = []; // Track previous stage names for dependency edges

  for (const stageDef of pipeline.stages) {
    if (stageDef.parallel) {
      // ── Parallel group ──
      const parallelGroupName = stageDef.name || `Parallel-${stageIndex}`;
      const parallelNames = [];

      for (const parallelStage of stageDef.parallel) {
        const node = {
          index: stageIndex++,
          name: parallelStage.name,
          steps: parallelStage.steps || [],
          status: 'pending',
          parallel_group: parallelGroupName,
          depends_on: [...prevNodeNames], // All depend on previous sequential stage
          when: parallelStage.when || null,
          startedAt: null,
          completedAt: null,
          duration: null,
        };

        // Evaluate `when` condition
        if (node.when && node.when.branch && node.when.branch !== branch) {
          node.status = 'skipped';
        }

        nodes.push(node);
        parallelNames.push(parallelStage.name);
      }

      // Next sequential stage depends on ALL parallel stages
      prevNodeNames = parallelNames;

    } else {
      // ── Sequential stage ──
      const node = {
        index: stageIndex++,
        name: stageDef.name,
        steps: stageDef.steps || [],
        status: 'pending',
        parallel_group: null,
        depends_on: [...prevNodeNames],
        when: stageDef.when || null,
        startedAt: null,
        completedAt: null,
        duration: null,
      };

      // Evaluate `when` condition
      if (node.when && node.when.branch && node.when.branch !== branch) {
        node.status = 'skipped';
      }

      nodes.push(node);
      prevNodeNames = [stageDef.name];
    }
  }

  return nodes;
}

// ─── 4. DAG Walker (State Machine) ─────────────────────────────────

/**
 * Execute a job by walking its DAG.
 * Stages transition: PENDING → READY → RUNNING → COMPLETED/FAILED/SKIPPED
 * 
 * @param {object} job - The job object (from scheduler)
 * @returns {Promise<void>}
 */
async function executeJob(job) {
  // Resolve and parse the Jenkinsfile
  const filePath = resolveJenkinsfile(job.repo);
  if (!filePath) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    eventBus.publish('job.completed', { job: { ...job }, finalStatus: 'failed' });
    return;
  }

  let pipeline;
  try {
    pipeline = parseJenkinsfile(filePath);
  } catch (err) {
    console.error(`[Pipeline] Parse error for ${job.repo}:`, err.message);
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    eventBus.publish('job.completed', { job: { ...job }, finalStatus: 'failed' });
    return;
  }

  // Build the DAG
  const stages = buildDAG(pipeline, job.branch);
  job.stages = stages;

  console.log(`[Pipeline] Built DAG for ${job.repo}/${job.branch}: ${stages.length} stages`);
  eventBus.publish('job.stages_loaded', { jobId: job.id, stages: stages.map(s => ({ ...s })) });

  // Walk the DAG
  try {
    await walkDAG(job, stages);

    // Check if any stage failed
    const hasFailed = stages.some(s => s.status === 'failed');
    job.status = hasFailed ? 'failed' : 'completed';
    job.completedAt = new Date().toISOString();

    console.log(`[Pipeline] Job ${job.id.substring(0, 8)} finished: ${job.status}`);
    eventBus.publish('job.completed', { job: { ...job } });

  } catch (err) {
    console.error(`[Pipeline] Execution error for job ${job.id.substring(0, 8)}:`, err.message);
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    eventBus.publish('job.completed', { job: { ...job } });
  }
}

/**
 * Walk the DAG, dispatching ready stages and waiting for completion.
 * Handles parallel execution by dispatching all ready stages at once.
 */
async function walkDAG(job, stages) {
  while (true) {
    // Find all stages that are READY to run
    const ready = findReadyStages(stages);

    if (ready.length === 0) {
      // Check if we're done
      const allDone = stages.every(s =>
        s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
      );
      if (allDone) break;

      // Check for deadlock (no ready stages but not all done)
      const hasPending = stages.some(s => s.status === 'pending');
      if (hasPending) {
        // This means a dependency failed — fail remaining pending stages
        for (const stage of stages) {
          if (stage.status === 'pending') {
            stage.status = 'failed';
            stage.completedAt = new Date().toISOString();
            eventBus.publish('stage.completed', {
              jobId: job.id,
              stageName: stage.name,
              stageIndex: stage.index,
              status: 'failed',
              reason: 'dependency_failed',
            });
          }
        }
        break;
      }
      break;
    }

    // Execute all ready stages in parallel
    await Promise.all(ready.map(stage => executeStage(job, stage, stages)));

    // After parallel batch completes, check for fail-fast
    const failed = stages.some(s => s.status === 'failed');
    if (failed) {
      // Fail-fast: cancel all remaining pending stages
      for (const stage of stages) {
        if (stage.status === 'pending') {
          stage.status = 'failed';
          stage.completedAt = new Date().toISOString();
          eventBus.publish('stage.completed', {
            jobId: job.id,
            stageName: stage.name,
            stageIndex: stage.index,
            status: 'failed',
            reason: 'fail_fast',
          });
        }
      }
      break;
    }
  }
}

/**
 * Find stages whose dependencies are all satisfied.
 * A stage is ready if:
 *   - status is 'pending'
 *   - all depends_on stages are 'completed' or 'skipped'
 */
function findReadyStages(stages) {
  return stages.filter(stage => {
    if (stage.status !== 'pending') return false;

    // Check all dependencies
    return stage.depends_on.every(depName => {
      const dep = stages.find(s => s.name === depName);
      return dep && (dep.status === 'completed' || dep.status === 'skipped');
    });
  });
}

/**
 * Execute a single stage with simulated delay.
 * @param {object} job 
 * @param {object} stage 
 * @param {Array} allStages - Reference to all stages (for fail-fast check)
 */
async function executeStage(job, stage, allStages) {
  // Mark as running
  stage.status = 'running';
  stage.startedAt = new Date().toISOString();

  console.log(`[Pipeline] ▶ ${job.repo}/${job.branch} — Stage "${stage.name}" started`);
  eventBus.publish('stage.started', {
    jobId: job.id,
    stageName: stage.name,
    stageIndex: stage.index,
    steps: stage.steps,
    parallel_group: stage.parallel_group,
  });

  // Simulate execution with random delay (2-6 seconds)
  const delay = 2000 + Math.random() * 4000;
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate ~5% failure rate for realism (except Checkout which always succeeds)
  const shouldFail = stage.name !== 'Checkout' && Math.random() < 0.05;

  if (shouldFail) {
    stage.status = 'failed';
    stage.completedAt = new Date().toISOString();
    stage.duration = new Date(stage.completedAt) - new Date(stage.startedAt);

    console.log(`[Pipeline] ✗ ${job.repo}/${job.branch} — Stage "${stage.name}" FAILED`);
  } else {
    stage.status = 'completed';
    stage.completedAt = new Date().toISOString();
    stage.duration = new Date(stage.completedAt) - new Date(stage.startedAt);

    console.log(`[Pipeline] ✓ ${job.repo}/${job.branch} — Stage "${stage.name}" completed (${(stage.duration / 1000).toFixed(1)}s)`);
  }

  eventBus.publish('stage.completed', {
    jobId: job.id,
    stageName: stage.name,
    stageIndex: stage.index,
    status: stage.status,
    duration: stage.duration,
  });
}

module.exports = { executeJob };
