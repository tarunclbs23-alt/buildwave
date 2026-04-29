/**
 * BuildWave — CI/CD Pipeline Dashboard
 * 
 * Main application component.
 * Three-column Kanban board: Queued | In Progress | Completed
 * Real-time updates via Server-Sent Events.
 */

import { useState, useEffect } from 'react';
import './index.css';
import Header from './components/Header';
import JobCard from './components/JobCard';
import TriggerModal from './components/TriggerModal';
import useSSE from './hooks/useSSE';
import useJobs from './hooks/useJobs';

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const { jobs, queued, inProgress, completed, handleEvent, totalJobs, deleteJob, clearCompleted } = useJobs();
  const { connected } = useSSE(handleEvent);

  // Count failed jobs in completed column
  const failedCount = completed.filter(j => j.status === 'failed').length;

  return (
    <>
      <Header
        connected={connected}
        onTriggerClick={() => setModalOpen(true)}
      />

      {/* Stats Bar */}
      <div className="stats-bar" id="stats-bar">
        <div className="stat-item queued">
          <span className="stat-count">{queued.length}</span>
          <span className="stat-label">Queued</span>
        </div>
        <div className="stat-item running">
          <span className="stat-count">{inProgress.length}</span>
          <span className="stat-label">Running</span>
        </div>
        <div className="stat-item completed">
          <span className="stat-count">{completed.length - failedCount}</span>
          <span className="stat-label">Passed</span>
        </div>
        <div className="stat-item failed">
          <span className="stat-count">{failedCount}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      {/* Three-Column Dashboard */}
      <main className="dashboard" id="dashboard">
        {/* ── Queued Column ── */}
        <div className="column queued" id="column-queued">
          <div className="column-header">
            <div className="column-title">
              <span className="column-title-dot" />
              <span>Queued</span>
            </div>
            <span className="column-count">{queued.length}</span>
          </div>
          <div className="column-jobs">
            {queued.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-text">No jobs in queue</div>
              </div>
            ) : (
              queued.map(job => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>

        {/* ── In Progress Column ── */}
        <div className="column in-progress" id="column-in-progress">
          <div className="column-header">
            <div className="column-title">
              <span className="column-title-dot" />
              <span>In Progress</span>
            </div>
            <span className="column-count">{inProgress.length}</span>
          </div>
          <div className="column-jobs">
            {inProgress.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">⚙️</div>
                <div className="empty-state-text">No builds running</div>
              </div>
            ) : (
              inProgress.map(job => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>

        {/* ── Completed Column ── */}
        <div className="column completed" id="column-completed">
          <div className="column-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="column-title">
                <span className="column-title-dot" />
                <span>Completed</span>
              </div>
              <span className="column-count">{completed.length}</span>
            </div>
            {completed.length > 0 && (
              <button 
                onClick={clearCompleted}
                title="Clear all completed jobs"
                style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '14px', padding: '4px', borderRadius: '4px' }}
                onMouseOver={(e) => e.target.style.background = 'rgba(255, 107, 107, 0.1)'}
                onMouseOut={(e) => e.target.style.background = 'none'}
              >
                🗑️
              </button>
            )}
          </div>
          <div className="column-jobs">
            {completed.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏁</div>
                <div className="empty-state-text">No completed builds yet</div>
              </div>
            ) : (
              completed.map(job => <JobCard key={job.id} job={job} onDelete={() => deleteJob(job.id)} />)
            )}
          </div>
        </div>
      </main>

      {/* Trigger Modal */}
      <TriggerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

export default App;
