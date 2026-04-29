/**
 * JobCard — Displays a single CI/CD job with repo info, commit details, and stage progress.
 */

import { useState } from 'react';
import StageProgress from './StageProgress';

const REPO_ICONS = {
  'node-app': '📦',
  'python-api': '🐍',
  'go-service': '🔷',
};

export default function JobCard({ job, onDelete }) {
  const [expanded, setExpanded] = useState(job.status === 'in_progress');

  const repoIcon = REPO_ICONS[job.repo] || '📁';
  const isMain = job.branch === 'main' || job.branch === 'master';
  const shortSha = (job.sha || '').substring(0, 7);
  const timeAgo = formatTimeAgo(job.createdAt);
  const priorityLabel = job.priority === 1 ? 'P1' : job.priority === 2 ? 'P2' : 'P3';

  // Total duration for completed jobs
  let totalDuration = '';
  if (job.completedAt && job.startedAt) {
    const ms = new Date(job.completedAt) - new Date(job.startedAt);
    totalDuration = formatDuration(ms);
  }

  return (
    <div
      className={`job-card ${job.status} job-card-enter`}
      onClick={() => setExpanded(!expanded)}
      id={`job-${job.id}`}
    >
      <div className="job-card-top">
        <div className="job-repo">
          <span className="job-repo-icon">{repoIcon}</span>
          <span className="job-repo-name">{job.repo}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={`job-branch ${isMain ? 'main' : ''}`}>
            ⎇ {job.branch}
          </span>
          {(job.status === 'completed' || job.status === 'failed') && (
            <span className={`status-badge ${job.status}`}>
              {job.status === 'completed' ? '✓ Pass' : '✗ Fail'}
            </span>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete job"
              style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '12px', padding: '0', margin: '0 0 0 4px', borderRadius: '4px' }}
              onMouseOver={(e) => e.target.style.background = 'rgba(255, 107, 107, 0.1)'}
              onMouseOut={(e) => e.target.style.background = 'none'}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div className="job-message">{job.message}</div>

      <div className="job-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="job-author">👤 {job.author}</span>
          {job.repoFullName ? (
            <a
              href={`https://github.com/${job.repoFullName}/commit/${job.sha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="job-sha"
              onClick={(e) => e.stopPropagation()}
              title="View commit on GitHub"
            >
              {shortSha}
            </a>
          ) : (
            <span className="job-sha">{shortSha}</span>
          )}
          <span className={`job-priority p${job.priority}`}>
            ▲ {priorityLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {totalDuration && (
            <span className="job-duration">⏱ {totalDuration}</span>
          )}
          <span className="job-time">{timeAgo}</span>
        </div>
      </div>

      {/* Stage progress — always shown for in-progress, toggleable for others */}
      {(expanded || job.status === 'in_progress') && job.stages && job.stages.length > 0 && (
        <StageProgress stages={job.stages} />
      )}
    </div>
  );
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}
