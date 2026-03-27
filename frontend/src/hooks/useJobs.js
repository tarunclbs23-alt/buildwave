/**
 * useJobs — State management hook for BuildWave jobs.
 * Maintains the central jobs map and processes SSE events.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:3001';

export default function useJobs() {
  const [jobs, setJobs] = useState({});
  const initialLoadDone = useRef(false);

  // Load existing jobs on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    fetch(`${API_BASE}/api/jobs`)
      .then(res => res.json())
      .then(data => {
        const allJobs = [
          ...(data.queued || []),
          ...(data.in_progress || []),
          ...(data.completed || []),
        ];
        const map = {};
        for (const job of allJobs) {
          map[job.id] = job;
        }
        setJobs(map);
      })
      .catch(err => console.error('[Jobs] Failed to load initial jobs:', err));
  }, []);

  /**
   * Process an SSE event and update jobs state.
   */
  const handleEvent = useCallback((event) => {
    const { type, data } = event;

    switch (type) {
      case 'job.queued':
        setJobs(prev => ({
          ...prev,
          [data.job.id]: { ...data.job },
        }));
        break;

      case 'job.dispatched':
        setJobs(prev => ({
          ...prev,
          [data.job.id]: {
            ...prev[data.job.id],
            ...data.job,
            status: 'in_progress',
          },
        }));
        break;

      case 'job.stages_loaded':
        setJobs(prev => {
          const existing = prev[data.jobId];
          if (!existing) return prev;
          return {
            ...prev,
            [data.jobId]: {
              ...existing,
              stages: data.stages,
            },
          };
        });
        break;

      case 'stage.started':
        setJobs(prev => {
          const existing = prev[data.jobId];
          if (!existing || !existing.stages) return prev;
          const stages = existing.stages.map(s =>
            s.name === data.stageName
              ? { ...s, status: 'running', startedAt: new Date().toISOString() }
              : s
          );
          return {
            ...prev,
            [data.jobId]: { ...existing, stages },
          };
        });
        break;

      case 'stage.completed':
        setJobs(prev => {
          const existing = prev[data.jobId];
          if (!existing || !existing.stages) return prev;
          const stages = existing.stages.map(s =>
            s.name === data.stageName
              ? {
                  ...s,
                  status: data.status,
                  completedAt: new Date().toISOString(),
                  duration: data.duration,
                }
              : s
          );
          return {
            ...prev,
            [data.jobId]: { ...existing, stages },
          };
        });
        break;

      case 'job.completed':
        setJobs(prev => ({
          ...prev,
          [data.job.id]: {
            ...prev[data.job.id],
            ...data.job,
          },
        }));
        break;

      default:
        break;
    }
  }, []);

  // Derive computed lists
  const jobList = Object.values(jobs);
  const queued = jobList
    .filter(j => j.status === 'queued')
    .sort((a, b) => a.priority - b.priority || new Date(a.createdAt) - new Date(b.createdAt));

  const inProgress = jobList
    .filter(j => j.status === 'in_progress')
    .sort((a, b) => new Date(b.startedAt || b.createdAt) - new Date(a.startedAt || a.createdAt));

  const completed = jobList
    .filter(j => j.status === 'completed' || j.status === 'failed')
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));

  return {
    jobs,
    queued,
    inProgress,
    completed,
    handleEvent,
    totalJobs: jobList.length,
  };
}
