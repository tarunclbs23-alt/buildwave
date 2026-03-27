/**
 * TriggerModal — Dialog to manually trigger a CI/CD build.
 * Selects a repo, inputs branch, auto-generates SHA, posts to /api/webhook.
 */

import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3001';

const SAMPLE_AUTHORS = ['tarun', 'alice', 'bob', 'charlie', 'diana'];
const SAMPLE_MESSAGES = [
  'Fix authentication middleware',
  'Add unit tests for user service',
  'Update dependencies',
  'Refactor database queries',
  'Fix CSS layout issues',
  'Add error handling',
  'Optimize build pipeline',
  'Update README with new docs',
  'Fix memory leak in worker pool',
  'Add rate limiting to API',
  'Implement retry logic',
  'Fix race condition in scheduler',
];

function randomHex(len) {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export default function TriggerModal({ isOpen, onClose }) {
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [author, setAuthor] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch available repos on mount
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API_BASE}/api/repos`)
      .then(res => res.json())
      .then(data => {
        setRepos(data.repos || []);
        if (data.repos && data.repos.length > 0 && !repo) {
          setRepo(data.repos[0]);
        }
      })
      .catch(() => setRepos(['node-app', 'python-api', 'go-service']));

    // Randomize author and message
    setAuthor(SAMPLE_AUTHORS[Math.floor(Math.random() * SAMPLE_AUTHORS.length)]);
    setMessage(SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)]);
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!repo || !branch) return;
    setLoading(true);

    const payload = {
      repo: repo,
      branch: branch,
      sha: randomHex(40),
      author: author || 'anonymous',
      message: message || 'Manual trigger',
    };

    try {
      const res = await fetch(`${API_BASE}/api/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        console.log('[Trigger] Job created:', data);
        onClose();
      } else {
        alert(data.error || 'Failed to trigger build');
      }
    } catch (err) {
      alert('Failed to connect to BuildWave server');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} id="trigger-modal">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">
          <span>⚡</span> Trigger Build
        </h2>

        <div className="modal-field">
          <label className="modal-label" htmlFor="repo-select">Repository</label>
          <select
            id="repo-select"
            className="modal-select"
            value={repo}
            onChange={e => setRepo(e.target.value)}
          >
            {repos.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-label" htmlFor="branch-input">Branch</label>
          <input
            id="branch-input"
            className="modal-input"
            type="text"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            placeholder="main"
          />
        </div>

        <div className="modal-field">
          <label className="modal-label" htmlFor="author-input">Author</label>
          <input
            id="author-input"
            className="modal-input"
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="tarun"
          />
        </div>

        <div className="modal-field">
          <label className="modal-label" htmlFor="message-input">Commit Message</label>
          <input
            id="message-input"
            className="modal-input"
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Fix authentication middleware"
          />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={loading || !repo || !branch}
            id="submit-trigger-btn"
          >
            {loading ? 'Triggering...' : '🚀 Trigger'}
          </button>
        </div>
      </div>
    </div>
  );
}
