/**
 * Webhook Listener — The front door of BuildWave.
 * Receives GitHub-format POST payloads, validates, normalizes into JobRequest,
 * and hands off to the Job Scheduler.
 */

const { v4: uuidv4 } = require('uuid');
const scheduler = require('./jobScheduler');

/**
 * Determine priority tier from branch name.
 *   main/master → 1 (highest)
 *   PR branches (contain 'pr' or 'pull') → 2
 *   feature branches → 3
 */
function computePriority(branch) {
  const lower = branch.toLowerCase();
  if (lower === 'main' || lower === 'master') return 1;
  if (lower.includes('pr') || lower.includes('pull')) return 2;
  return 3;
}

/**
 * Extract short repo name from full GitHub name.
 * "tarun/node-app" → "node-app"
 */
function extractRepoName(fullName) {
  if (!fullName) return 'unknown';
  const parts = fullName.split('/');
  return parts[parts.length - 1];
}

/**
 * Extract branch from ref string.
 * "refs/heads/main" → "main"
 */
function extractBranch(ref) {
  if (!ref) return 'unknown';
  return ref.replace('refs/heads/', '');
}

/**
 * POST /api/webhook handler.
 * Accepts GitHub-format webhook or simplified payload.
 */
function webhookHandler(req, res) {
  try {
    const payload = req.body;

    // --- Validation ---
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload: body must be JSON object' });
    }

    // Support both GitHub-format and simplified format
    const repoFullName = payload.repository?.full_name || payload.repository?.name || payload.repo;
    const ref = payload.ref || `refs/heads/${payload.branch || 'main'}`;
    const sha = payload.after || payload.head_commit?.id || payload.sha;
    const author = payload.head_commit?.author?.name || payload.pusher?.name || payload.author || 'unknown';
    const message = payload.head_commit?.message || payload.message || 'No commit message';

    if (!repoFullName) {
      return res.status(400).json({ error: 'Missing required field: repository name' });
    }
    if (!sha) {
      return res.status(400).json({ error: 'Missing required field: commit SHA (after / head_commit.id / sha)' });
    }

    const branch = extractBranch(ref);
    const repoName = extractRepoName(repoFullName);

    // --- Normalize into canonical JobRequest ---
    const jobRequest = {
      id: uuidv4(),
      repo: repoName,
      repoFullName: repoFullName,
      branch: branch,
      sha: sha,
      author: author,
      message: message,
      timestamp: new Date().toISOString(),
      pipeline_file: payload.pipeline_file || 'Jenkinsfile.yaml',
      priority: computePriority(branch),
      status: 'queued',
      stages: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    console.log(`[Webhook] Received push → ${repoName}/${branch} @ ${sha.substring(0, 7)} by ${author}`);

    // --- Hand off to scheduler ---
    const result = scheduler.enqueueJob(jobRequest);

    if (result.rejected) {
      return res.status(409).json({
        error: result.reason,
        repo: repoName,
        sha: sha,
      });
    }

    return res.status(201).json({
      message: 'Job queued successfully',
      job: {
        id: jobRequest.id,
        repo: repoName,
        branch: branch,
        sha: sha.substring(0, 7),
        priority: jobRequest.priority,
        status: jobRequest.status,
      },
    });
  } catch (err) {
    console.error('[Webhook] Error processing payload:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { webhookHandler };
