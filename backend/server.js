/**
 * BuildWave — Server Entry Point
 * 
 * Express.js server that wires up:
 *   - Webhook Listener (POST /api/webhook)
 *   - Job Scheduler REST API (GET /api/jobs)
 *   - SSE Events stream (GET /api/events)
 *   - Pipeline Engine (connected to scheduler)
 */

const express = require('express');
const cors = require('cors');

// ─── Import modules ─────────────────────────────────────────────────
const { webhookHandler } = require('./src/webhookListener');
const { sseHandler } = require('./src/sseManager');
const scheduler = require('./src/jobScheduler');
const pipelineEngine = require('./src/pipelineEngine');
const db = require('./src/db');

// ─── Initialize ─────────────────────────────────────────────────────
// Wire pipeline engine into scheduler (avoids circular dependency)
scheduler.init(pipelineEngine);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  if (req.path !== '/api/events' && req.path !== '/api/health') {
    console.log(`[HTTP] ${req.method} ${req.path}`);
  }
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'buildwave', uptime: process.uptime() });
});

// Webhook listener
app.post('/api/webhook', webhookHandler);

// SSE event stream
app.get('/api/events', sseHandler);

// Job listing
app.get('/api/jobs', async (req, res) => {
  try {
    const state = await scheduler.getQueueState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Single job detail
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await scheduler.getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete all completed jobs
app.delete('/api/jobs/completed', async (req, res) => {
  try {
    const count = await scheduler.deleteAllCompleted();
    res.json({ message: `Deleted ${count} jobs` });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete single job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const success = await scheduler.deleteJob(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Job not found or not completed' });
    }
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// List available repos (for trigger modal)
app.get('/api/repos', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const jenkinsDir = path.join(__dirname, 'jenkinsfiles');
  
  try {
    const repos = fs.readdirSync(jenkinsDir).filter(f => {
      return fs.statSync(path.join(jenkinsDir, f)).isDirectory();
    });
    res.json({ repos });
  } catch {
    res.json({ repos: [] });
  }
});

// ─── Start ──────────────────────────────────────────────────────────
db.init().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║                                          ║');
    console.log('  ║   🔨  B U I L D W A V E   S E R V E R   ║');
    console.log('  ║                                          ║');
    console.log(`  ║   Running on http://localhost:${PORT}       ║`);
    console.log('  ║                                          ║');
    console.log('  ║   Endpoints:                             ║');
    console.log('  ║     POST /api/webhook    Receive pushes  ║');
    console.log('  ║     GET  /api/events     SSE stream      ║');
    console.log('  ║     GET  /api/jobs       List jobs       ║');
    console.log('  ║     GET  /api/jobs/:id   Job detail      ║');
    console.log('  ║     GET  /api/repos      List repos      ║');
    console.log('  ║     GET  /api/health     Health check    ║');
    console.log('  ║                                          ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}).catch(err => {
  console.error('Failed to start server due to DB init error:', err);
  process.exit(1);
});
