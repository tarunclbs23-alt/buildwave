/**
 * StageProgress — Renders pipeline stage progress for an in-progress or completed job.
 * Shows each stage with status icons, parallel grouping, and durations.
 */

export default function StageProgress({ stages }) {
  if (!stages || stages.length === 0) {
    return (
      <div className="stage-progress">
        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          Loading pipeline stages...
        </div>
      </div>
    );
  }

  // Group stages for rendering (detect parallel groups)
  const groups = [];
  let currentParallel = null;

  for (const stage of stages) {
    if (stage.parallel_group) {
      if (currentParallel && currentParallel.groupName === stage.parallel_group) {
        currentParallel.stages.push(stage);
      } else {
        currentParallel = { type: 'parallel', groupName: stage.parallel_group, stages: [stage] };
        groups.push(currentParallel);
      }
    } else {
      currentParallel = null;
      groups.push({ type: 'single', stage });
    }
  }

  return (
    <div className="stage-progress">
      <div className="stage-list">
        {groups.map((group, idx) => {
          if (group.type === 'single') {
            return <StageItem key={idx} stage={group.stage} />;
          }
          return (
            <div key={idx} className="parallel-group">
              {group.stages.map((s, sIdx) => (
                <StageItem key={sIdx} stage={s} isParallel />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageItem({ stage, isParallel }) {
  const statusIcon = getStatusIcon(stage.status);
  const duration = stage.duration
    ? `${(stage.duration / 1000).toFixed(1)}s`
    : stage.status === 'running'
    ? '...'
    : '';

  return (
    <div className={`stage-item ${stage.status}`}>
      <span className={`stage-icon ${stage.status}`}>{statusIcon}</span>
      <span className="stage-name">{stage.name}</span>
      {isParallel && <span className="stage-parallel-badge">∥</span>}
      {duration && <span className="stage-duration">{duration}</span>}
    </div>
  );
}

function getStatusIcon(status) {
  switch (status) {
    case 'pending': return '○';
    case 'running': return '◎';
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'skipped': return '⊘';
    default: return '○';
  }
}
