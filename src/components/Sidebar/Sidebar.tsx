import { useAppStore, type LayerState } from '../../store/useAppStore';

const layerConfig: { key: keyof LayerState; label: string; color: string }[] = [
  { key: 'flights', label: 'Flights', color: '#00E5FF' },
  { key: 'satellites', label: 'Satellites', color: '#FFEB3B' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF5722' },
  { key: 'cameras', label: 'Cameras', color: '#FF6B35' },
];

export function Sidebar() {
  const { layers, toggleLayer } = useAppStore();

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
          {layerConfig.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className="flex items-center gap-3 w-full text-left group"
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
              <div
                className="ml-auto text-xs px-2 py-0.5 rounded font-mono"
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
          ))}
        </div>
      </div>
    </div>
  );
}
