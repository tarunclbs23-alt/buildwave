/**
 * EventBus — In-process event emitter for BuildWave.
 * Components publish events; the SSE manager subscribes and streams to clients.
 * 
 * Events:
 *   job.queued      — A new job entered the priority queue
 *   job.dispatched  — A job was sent to the pipeline engine
 *   stage.started   — A pipeline stage began executing
 *   stage.completed — A pipeline stage finished (completed/failed/skipped)
 *   job.completed   — All stages done, job is finalized
 */

const EventEmitter = require('events');

class BuildWaveEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow many SSE clients
  }

  /**
   * Emit a typed event with structured payload
   */
  publish(eventType, payload) {
    const event = {
      type: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    };
    this.emit(eventType, event);
    this.emit('*', event); // Wildcard — SSE manager listens here
  }
}

// Singleton instance
const eventBus = new BuildWaveEventBus();

module.exports = eventBus;
