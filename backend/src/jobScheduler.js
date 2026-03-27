/**
 * Job Scheduler — The brain of BuildWave.
 * 
 * Five sub-components:
 *   1. Intake Handler    — SHA dedup, validation
 *   2. Priority Queue    — Min-heap by priority + FIFO
 *   3. Routing Engine    — Maps repo → Jenkinsfile config
 *   4. Concurrency Gate  — Max N concurrent builds per repo
 *   5. Dispatcher        — Dequeues + hands to Pipeline Engine
 */

const eventBus = require('./eventBus');

// ─── State ──────────────────────────────────────────────────────────

/** @type {Map<string, object>} jobId → job */
const jobStore = new Map();

/** @type {Array<object>} Priority queue (sorted array) */
const queue = [];

/** @type {Set<string>} "repo:sha" keys for deduplication */
const shaSet = new Set();

/** @type {Map<string, number>} repo → count of currently running jobs */
const concurrencyMap = new Map();

/** Max concurrent builds per repo */
const MAX_CONCURRENT_PER_REPO = 2;

/** Reference to the pipeline engine (set via init to avoid circular deps) */
let pipelineEngine = null;

// ─── 1. Intake Handler ─────────────────────────────────────────────

/**
 * Enqueue a new job. Checks for SHA duplicates, inserts into priority queue.
 * @param {object} jobRequest - Canonical job from the WebhookListener
 * @returns {{ rejected?: boolean, reason?: string }}
 */
function enqueueJob(jobRequest) {
  const dedupKey = `${jobRequest.repo}:${jobRequest.sha}`;

  // Idempotency check
  if (shaSet.has(dedupKey)) {
    console.log(`[Scheduler] Rejected duplicate: ${dedupKey}`);
    return { rejected: true, reason: `Duplicate: job for ${jobRequest.repo}@${jobRequest.sha.substring(0, 7)} already exists` };
  }

  shaSet.add(dedupKey);
  jobStore.set(jobRequest.id, jobRequest);

  // Insert into priority queue
  priorityEnqueue(jobRequest);

  console.log(`[Scheduler] Queued job ${jobRequest.id.substring(0, 8)} → ${jobRequest.repo}/${jobRequest.branch} (priority ${jobRequest.priority})`);

  eventBus.publish('job.queued', { job: sanitizeJob(jobRequest) });

  // Try to dispatch immediately
  tryDispatch();

  return {};
}

// ─── 2. Priority Queue ─────────────────────────────────────────────

/**
 * Insert into sorted queue. Lower priority number = higher priority.
 * Within same priority, earlier timestamp goes first (FIFO).
 */
function priorityEnqueue(job) {
  let inserted = false;
  for (let i = 0; i < queue.length; i++) {
    if (job.priority < queue[i].priority ||
        (job.priority === queue[i].priority && job.timestamp < queue[i].timestamp)) {
      queue.splice(i, 0, job);
      inserted = true;
      break;
    }
  }
  if (!inserted) queue.push(job);
}

/**
 * Dequeue the highest-priority eligible job (respects concurrency gate).
 * @returns {object|null}
 */
function dequeueNext() {
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    if (canRun(job.repo)) {
      queue.splice(i, 1);
      return job;
    }
  }
  return null;
}

// ─── 3. Routing Engine (simplified) ─────────────────────────────────

// In v1, routing is just "does the repo have a Jenkinsfile?" — handled by PipelineEngine

// ─── 4. Concurrency Gate ────────────────────────────────────────────

/**
 * Check if a repo has available executor slots.
 */
function canRun(repo) {
  const running = concurrencyMap.get(repo) || 0;
  return running < MAX_CONCURRENT_PER_REPO;
}

/**
 * Acquire a slot for the repo.
 */
function acquireSlot(repo) {
  const current = concurrencyMap.get(repo) || 0;
  concurrencyMap.set(repo, current + 1);
  console.log(`[Scheduler] Slot acquired for ${repo}. Running: ${current + 1}/${MAX_CONCURRENT_PER_REPO}`);
}

/**
 * Release a slot when a job completes.
 */
function releaseSlot(repo) {
  const current = concurrencyMap.get(repo) || 1;
  concurrencyMap.set(repo, Math.max(0, current - 1));
  console.log(`[Scheduler] Slot released for ${repo}. Running: ${Math.max(0, current - 1)}/${MAX_CONCURRENT_PER_REPO}`);

  // Try to dispatch waiting jobs now that a slot opened
  tryDispatch();
}

// ─── 5. Dispatcher ──────────────────────────────────────────────────

/**
 * Try to dequeue and dispatch the next eligible job.
 */
function tryDispatch() {
  if (!pipelineEngine) return;

  const job = dequeueNext();
  if (!job) return;

  acquireSlot(job.repo);

  job.status = 'in_progress';
  job.startedAt = new Date().toISOString();

  console.log(`[Scheduler] Dispatching job ${job.id.substring(0, 8)} → Pipeline Engine`);
  eventBus.publish('job.dispatched', { job: sanitizeJob(job) });

  // Hand off to pipeline engine (async — it simulates execution)
  pipelineEngine.executeJob(job).then(() => {
    // Job finished (completed or failed)
    releaseSlot(job.repo);
  });
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Initialize with reference to pipeline engine (avoids circular deps).
 */
function init(engine) {
  pipelineEngine = engine;
}

/**
 * Get the full state for the REST API.
 */
function getQueueState() {
  const jobs = Array.from(jobStore.values()).map(sanitizeJob);
  return {
    queued: jobs.filter(j => j.status === 'queued'),
    in_progress: jobs.filter(j => j.status === 'in_progress'),
    completed: jobs.filter(j => j.status === 'completed' || j.status === 'failed'),
    total: jobs.length,
  };
}

/**
 * Get all jobs as array.
 */
function getAllJobs() {
  return Array.from(jobStore.values()).map(sanitizeJob);
}

/**
 * Get a single job by ID.
 */
function getJobById(id) {
  const job = jobStore.get(id);
  return job ? sanitizeJob(job) : null;
}

/**
 * Create a safe copy for API/SSE responses.
 */
function sanitizeJob(job) {
  return { ...job };
}

module.exports = {
  init,
  enqueueJob,
  getQueueState,
  getAllJobs,
  getJobById,
  releaseSlot,
};
