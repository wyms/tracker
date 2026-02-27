import { useAppStore } from '../../store/useAppStore';

const statConfig = [
  { key: 'flights' as const, label: 'Aircraft', color: '#00E5FF', icon: '\u2708' },
  { key: 'satellites' as const, label: 'Satellites', color: '#FFEB3B', icon: '\u25CF' },
  { key: 'earthquakes' as const, label: 'Quakes', color: '#FF5722', icon: '\u25C9' },
  { key: 'cameras' as const, label: 'Cameras', color: '#FF6B35', icon: '\u25A3' },
];

export function StatsPanel() {
  const { entityCounts, layers } = useAppStore();

  const totalActive = Object.entries(layers)
    .filter(([key, on]) => on && key in entityCounts)
    .reduce((sum, [key]) => sum + entityCounts[key as keyof typeof entityCounts], 0);

  return (
    <div className="absolute bottom-10 left-4 z-10">
      <div
        className="rounded-lg p-3 border backdrop-blur-sm"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <div
          className="text-xs font-bold tracking-widest mb-2 uppercase"
          style={{ color: '#00E5FF' }}
        >
          Tracking
        </div>
        <div className="space-y-1.5">
          {statConfig.map(({ key, label, color, icon }) => (
            <div key={key} className="flex items-center gap-2 text-xs font-mono">
              <span style={{ color, opacity: layers[key] ? 1 : 0.3 }}>{icon}</span>
              <span style={{ color: layers[key] ? '#9CA3AF' : '#4A5568' }}>{label}</span>
              <span
                className="ml-auto tabular-nums"
                style={{ color: layers[key] ? color : '#4A5568' }}
              >
                {layers[key] ? entityCounts[key].toLocaleString() : '--'}
              </span>
            </div>
          ))}
        </div>
        <div
          className="mt-2 pt-2 flex items-center justify-between text-xs font-mono"
          style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}
        >
          <span style={{ color: '#9CA3AF' }}>Total</span>
          <span className="font-bold" style={{ color: '#00E5FF' }}>
            {totalActive.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
