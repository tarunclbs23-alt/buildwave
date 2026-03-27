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
app.get('/api/jobs', (req, res) => {
  const state = scheduler.getQueueState();
  res.json(state);
});

// Single job detail
app.get('/api/jobs/:id', (req, res) => {
  const job = scheduler.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
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
