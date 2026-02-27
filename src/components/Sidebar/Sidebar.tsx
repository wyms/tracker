import { useAppStore, type LayerState } from '../../store/useAppStore';

const layerConfig: { key: keyof LayerState; label: string; color: string; shortcut: string }[] = [
  { key: 'flights', label: 'Flights', color: '#00E5FF', shortcut: '1' },
  { key: 'satellites', label: 'Satellites', color: '#FFEB3B', shortcut: '2' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF5722', shortcut: '3' },
  { key: 'cameras', label: 'Cameras', color: '#FF6B35', shortcut: '4' },
  { key: 'weather', label: 'Weather', color: '#64B5F6', shortcut: '5' },
];

export function Sidebar() {
  const { layers, toggleLayer, entityCounts } = useAppStore();

  return (
    <div className="absolute top-16 left-4 z-10 w-56">
      <div
        className="rounded-lg p-4 border backdrop-blur-sm"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <h2
          className="text-xs font-bold tracking-widest mb-4 uppercase"
          style={{ color: '#00E5FF' }}
        >
          Data Layers
        </h2>
        <div className="space-y-3">
          {layerConfig.map(({ key, label, color, shortcut }) => {
            const count = key in entityCounts ? entityCounts[key as keyof typeof entityCounts] : undefined;
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                className="flex items-center gap-3 w-full text-left group"
                title={`Toggle ${label} (${shortcut})`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: layers[key] ? color : '#334155',
                    boxShadow: layers[key] ? `0 0 8px ${color}` : 'none',
                  }}
                />
                <span
                  className="text-sm font-medium transition-colors"
                  style={{
                    color: layers[key] ? '#E0E0E0' : '#4A5568',
                  }}
                >
                  {label}
                </span>
                {count !== undefined && layers[key] && count > 0 && (
                  <span
                    className="text-xs font-mono ml-auto mr-1"
                    style={{ color: color, opacity: 0.7 }}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
                <div
                  className={`text-xs px-2 py-0.5 rounded font-mono ${count !== undefined && layers[key] && count > 0 ? '' : 'ml-auto'}`}
                  style={{
                    background: layers[key]
                      ? 'rgba(0,229,255,0.15)'
                      : 'rgba(100,100,100,0.2)',
                    color: layers[key] ? '#00E5FF' : '#4A5568',
                  }}
                >
                  {layers[key] ? 'ON' : 'OFF'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
