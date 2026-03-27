/**
 * SSE Manager — Manages Server-Sent Event connections.
 * Subscribes to the EventBus wildcard and streams all events to connected clients.
 */

const eventBus = require('./eventBus');

/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();

/**
 * Express route handler for GET /api/events
 * Sets up SSE connection, sends heartbeats, cleans up on close.
 */
function sseHandler(req, res) {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'BuildWave SSE connected' })}\n\n`);

  clients.add(res);
  console.log(`[SSE] Client connected. Total: ${clients.size}`);

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 15000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`[SSE] Client disconnected. Total: ${clients.size}`);
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 */
function broadcast(event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

// Subscribe to ALL events from the EventBus
eventBus.on('*', (event) => {
  broadcast(event);
});

module.exports = { sseHandler };
