/**
 * Job Scheduler — The brain of BuildWave.
 * 
 * Modified to use PostgreSQL database for persistence.
 */

const eventBus = require('./eventBus');
const db = require('./db');

// Listen to pipeline events and update DB
eventBus.on('*', async (event) => {
  const { type, data } = event;
  try {
    if (type === 'job.stages_loaded') {
      await updateJob(data.jobId, { stages: data.stages });
    } else if (type === 'stage.started' || type === 'stage.completed') {
      const job = await getJobById(data.jobId);
      if (job) {
        const stages = job.stages || [];
        const stageIndex = stages.findIndex(s => s.name === data.stageName);
        if (stageIndex !== -1) {
          if (type === 'stage.started') {
            stages[stageIndex].status = 'running';
            stages[stageIndex].startedAt = new Date().toISOString();
          } else {
            stages[stageIndex].status = data.status;
            stages[stageIndex].completedAt = new Date().toISOString();
            stages[stageIndex].duration = data.duration;
          }
          await updateJob(data.jobId, { stages });
        }
      }
    } else if (type === 'job.completed') {
      await updateJob(data.job.id, { 
        status: data.finalStatus || data.job.status, 
        completedAt: data.job.completedAt,
        stages: data.job.stages 
      });
      // A slot just freed up, try dispatching again
      tryDispatch();
    }
  } catch (err) {
    console.error('[Scheduler] Failed to process event update:', err);
  }
});

/** Max concurrent builds per repo */
const MAX_CONCURRENT_PER_REPO = 2;

/** Reference to the pipeline engine (set via init to avoid circular deps) */
let pipelineEngine = null;

// ─── 1. Intake Handler ─────────────────────────────────────────────

/**
 * Enqueue a new job. Checks for SHA duplicates, inserts into priority queue.
 * @param {object} jobRequest - Canonical job from the WebhookListener
 * @returns {Promise<{ rejected?: boolean, reason?: string }>}
 */
async function enqueueJob(jobRequest) {
  // Idempotency check
  const duplicateCheck = await db.query('SELECT id FROM jobs WHERE repo = $1 AND sha = $2 LIMIT 1', [jobRequest.repo, jobRequest.sha]);
  if (duplicateCheck.rows.length > 0) {
    const dedupKey = `${jobRequest.repo}:${jobRequest.sha.substring(0, 7)}`;
    console.log(`[Scheduler] Rejected duplicate: ${dedupKey}`);
    return { rejected: true, reason: `Duplicate: job for ${dedupKey} already exists` };
  }

  // Insert into database
  await db.query(`
    INSERT INTO jobs (id, repo, "repoFullName", branch, sha, author, message, "timestamp", pipeline_file, priority, status, stages, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `, [
    jobRequest.id, jobRequest.repo, jobRequest.repoFullName, jobRequest.branch, jobRequest.sha, jobRequest.author, 
    jobRequest.message, jobRequest.timestamp, jobRequest.pipeline_file, jobRequest.priority, 'queued', 
    JSON.stringify(jobRequest.stages || []), jobRequest.createdAt
  ]);

  console.log(`[Scheduler] Queued job ${jobRequest.id.substring(0, 8)} → ${jobRequest.repo}/${jobRequest.branch} (priority ${jobRequest.priority})`);

  eventBus.publish('job.queued', { job: sanitizeJob(jobRequest) });

  // Try to dispatch immediately
  tryDispatch();

  return {};
}

// ─── 2. Priority Queue & Dispatcher ────────────────────────────────

/**
 * Check if a repo has available executor slots.
 */
async function canRun(repo) {
  const result = await db.query(`SELECT COUNT(*) as count FROM jobs WHERE repo = $1 AND status = 'in_progress'`, [repo]);
  const running = parseInt(result.rows[0].count, 10);
  return running < MAX_CONCURRENT_PER_REPO;
}

/**
 * Try to dequeue and dispatch the next eligible job.
 */
async function tryDispatch() {
  if (!pipelineEngine) return;

  // Find the highest priority queued job where the repo has available slots
  const queuedResult = await db.query(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY priority ASC, "createdAt" ASC`);
  
  for (const job of queuedResult.rows) {
    if (await canRun(job.repo)) {
      // Dispatch this job
      const now = new Date().toISOString();
      await db.query(`UPDATE jobs SET status = 'in_progress', "startedAt" = $1 WHERE id = $2`, [now, job.id]);
      
      job.status = 'in_progress';
      job.startedAt = now;
      if (typeof job.stages === 'string') job.stages = JSON.parse(job.stages);

      console.log(`[Scheduler] Dispatching job ${job.id.substring(0, 8)} → Pipeline Engine`);
      eventBus.publish('job.dispatched', { job: sanitizeJob(job) });

      // Hand off to pipeline engine (async — it simulates execution)
      pipelineEngine.executeJob(job).then(async () => {
        // Job finished (completed or failed) - handled by engine events, but we try dispatching again
        tryDispatch();
      });
      
      // Successfully dispatched one job, recursive call to dispatch more if possible
      tryDispatch();
      return;
    }
  }
}

/**
 * Update job in database (used by pipeline engine to save stages/status)
 */
async function updateJob(id, updates) {
  const fields = [];
  const values = [];
  let index = 1;
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`"${key}" = $${index}`);
    values.push(key === 'stages' ? JSON.stringify(value) : value);
    index++;
  }
  values.push(id);
  await db.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $${index}`, values);
}

// ─── Public API ─────────────────────────────────────────────────────

function init(engine) {
  pipelineEngine = engine;
}

async function getQueueState() {
  const result = await db.query(`SELECT * FROM jobs ORDER BY "createdAt" ASC`);
  const jobs = result.rows.map(parseStages);
  return {
    queued: jobs.filter(j => j.status === 'queued'),
    in_progress: jobs.filter(j => j.status === 'in_progress'),
    completed: jobs.filter(j => j.status === 'completed' || j.status === 'failed'),
    total: jobs.length,
  };
}

async function getAllJobs() {
  const result = await db.query(`SELECT * FROM jobs ORDER BY "createdAt" ASC`);
  return result.rows.map(parseStages);
}

async function getJobById(id) {
  const result = await db.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return parseStages(result.rows[0]);
}

function parseStages(job) {
  if (typeof job.stages === 'string') {
    job.stages = JSON.parse(job.stages);
  }
  return sanitizeJob(job);
}

function sanitizeJob(job) {
  return { ...job };
}

async function deleteJob(id) {
  const result = await db.query(`DELETE FROM jobs WHERE id = $1 AND status IN ('completed', 'failed')`, [id]);
  return result.rowCount > 0;
}

async function deleteAllCompleted() {
  const result = await db.query(`DELETE FROM jobs WHERE status IN ('completed', 'failed')`);
  return result.rowCount;
}

module.exports = {
  init,
  enqueueJob,
  getQueueState,
  getAllJobs,
  getJobById,
  deleteJob,
  deleteAllCompleted,
  updateJob,
  tryDispatch,
};
