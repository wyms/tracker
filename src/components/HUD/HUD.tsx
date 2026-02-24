import { useAppStore } from '../../store/useAppStore';

export function HUD() {
  const { cameraPosition } = useAppStore();

  const formatCoord = (val: number, pos: string, neg: string) => {
    const abs = Math.abs(val);
    const dir = val >= 0 ? pos : neg;
    return `${abs.toFixed(4)}° ${dir}`;
  };

  const formatAlt = (alt: number) => {
    if (alt > 1_000_000) return `${(alt / 1_000_000).toFixed(1)} Mm`;
    if (alt > 1_000) return `${(alt / 1_000).toFixed(1)} km`;
    return `${alt.toFixed(0)} m`;
  };

  return (
    <div className="absolute top-4 right-4 z-10">
      <div
        className="rounded-lg px-4 py-3 border backdrop-blur-sm"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <div className="text-xs font-mono space-y-1">
          <div className="flex gap-3">
            <span style={{ color: '#00E5FF' }}>LAT</span>
            <span className="text-gray-300">
              {formatCoord(cameraPosition.latitude, 'N', 'S')}
            </span>
          </div>
          <div className="flex gap-3">
            <span style={{ color: '#00E5FF' }}>LON</span>
            <span className="text-gray-300">
              {formatCoord(cameraPosition.longitude, 'E', 'W')}
            </span>
          </div>
          <div className="flex gap-3">
            <span style={{ color: '#00E5FF' }}>ALT</span>
            <span className="text-gray-300">{formatAlt(cameraPosition.altitude)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
