/**
 * Header — Top navigation bar with logo, connection status, and trigger button.
 */

export default function Header({ connected, onTriggerClick }) {
  return (
    <header className="header" id="header">
      <div className="header-left">
        <div className="logo">
          <div className="logo-icon">🔨</div>
          <span className="logo-text">BuildWave</span>
          <span className="logo-tag">CI/CD</span>
        </div>
      </div>

      <div className="header-right">
        <div className="connection-status">
          <span className={`connection-dot ${connected ? '' : 'disconnected'}`} />
          <span>{connected ? 'Live' : 'Disconnected'}</span>
        </div>

        <button
          className="btn-trigger"
          onClick={onTriggerClick}
          id="trigger-build-btn"
        >
          <span>⚡</span>
          <span>Trigger Build</span>
        </button>
      </div>
    </header>
  );
}
