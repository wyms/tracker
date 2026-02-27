import { useAppStore } from '../../store/useAppStore';

export function Toolbar() {
  const {
    requestScreenshot,
    measureMode,
    setMeasureMode,
    clearMeasure,
    trailsEnabled,
    toggleTrails,
  } = useAppStore();

  const buttons = [
    {
      label: 'Trails',
      shortcut: 'T',
      active: trailsEnabled,
      onClick: toggleTrails,
    },
    {
      label: 'Measure',
      shortcut: 'M',
      active: measureMode,
      onClick: () => (measureMode ? clearMeasure() : setMeasureMode(true)),
    },
    {
      label: 'Screenshot',
      shortcut: 'P',
      active: false,
      onClick: requestScreenshot,
    },
  ];

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
      <div
        className="rounded-lg border backdrop-blur-sm flex items-center gap-1 px-2 py-1.5"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        {buttons.map(({ label, shortcut, active, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors"
            style={{
              background: active ? 'rgba(0,229,255,0.15)' : 'transparent',
              color: active ? '#00E5FF' : '#6B7280',
            }}
            title={`${label} (${shortcut})`}
          >
            {label}
            <kbd
              className="text-xs px-1 rounded"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: '#4A5568',
                fontSize: '0.65rem',
              }}
            >
              {shortcut}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
