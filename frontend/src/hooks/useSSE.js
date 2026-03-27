/**
 * useSSE — Custom hook for Server-Sent Events connection.
 * Connects to the backend SSE endpoint and dispatches events to callbacks.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3001';

export default function useSSE(onEvent) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const onEventRef = useRef(onEvent);

  // Keep callback ref fresh
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let es;
    let reconnectTimeout;

    function connect() {
      es = new EventSource(`${API_BASE}/api/events`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        console.log('[SSE] Connected to BuildWave');
        setConnected(true);
      });

      // Listen for all our custom event types
      const eventTypes = [
        'job.queued',
        'job.dispatched',
        'job.stages_loaded',
        'stage.started',
        'stage.completed',
        'job.completed',
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e) => {
          try {
            const parsed = JSON.parse(e.data);
            onEventRef.current(parsed);
          } catch (err) {
            console.warn('[SSE] Failed to parse event:', e.data);
          }
        });
      }

      es.onerror = () => {
        console.warn('[SSE] Connection lost, reconnecting in 3s...');
        setConnected(false);
        es.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (es) es.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return { connected };
}
