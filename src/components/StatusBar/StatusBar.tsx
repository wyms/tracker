import { useAppStore, type LayerState, type DataTimestamp } from '../../store/useAppStore';

const layerLabels: { key: keyof LayerState; label: string; color: string }[] = [
  { key: 'flights', label: 'Flights', color: '#00E5FF' },
  { key: 'satellites', label: 'Satellites', color: '#FFEB3B' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF5722' },
  { key: 'cameras', label: 'Cameras', color: '#FF6B35' },
];

function formatTimestamp(ts: number | null): string {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function StatusBar() {
  const { layers, dataTimestamps } = useAppStore();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10">
      <div
        className="flex items-center justify-center gap-6 px-4 py-2 border-t"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.15)',
        }}
      >
        {layerLabels.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-2 text-xs font-mono">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: layers[key] ? color : '#334155',
                boxShadow: layers[key] ? `0 0 4px ${color}` : 'none',
              }}
            />
            <span style={{ color: layers[key] ? '#9CA3AF' : '#4A5568' }}>
              {label}
            </span>
            <span style={{ color: layers[key] ? color : '#4A5568' }}>
              {layers[key] ? formatTimestamp(dataTimestamps[key]) : 'OFF'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
