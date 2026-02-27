import { useAppStore } from '../../store/useAppStore';

export function MeasureTool() {
  const { measureMode, setMeasureMode, measurePoints, measureResult, clearMeasure } = useAppStore();

  return (
    <>
      {/* Measure mode indicator */}
      {measureMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20">
          <div
            className="rounded-lg px-4 py-2 border backdrop-blur-sm flex items-center gap-3"
            style={{
              background: 'rgba(13,27,42,0.95)',
              borderColor: 'rgba(76,175,80,0.4)',
            }}
          >
            <span className="text-xs font-mono" style={{ color: '#4CAF50' }}>
              {measurePoints.length === 0
                ? 'Click first point'
                : measurePoints.length === 1
                  ? 'Click second point'
                  : 'Measurement complete'}
            </span>
            <button
              onClick={clearMeasure}
              className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: 'rgba(255,87,34,0.15)', color: '#FF5722' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result display */}
      {measureResult && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20">
          <div
            className="rounded-lg px-4 py-3 border backdrop-blur-sm"
            style={{
              background: 'rgba(13,27,42,0.95)',
              borderColor: 'rgba(0,229,255,0.3)',
            }}
          >
            <div className="text-xs font-mono space-y-1">
              <div className="flex gap-4">
                <span style={{ color: '#00E5FF' }}>Distance</span>
                <span className="text-gray-200">
                  {measureResult.distanceKm < 1
                    ? `${(measureResult.distanceKm * 1000).toFixed(0)} m`
                    : `${measureResult.distanceKm.toFixed(2)} km`}
                  <span className="text-gray-500 ml-2">
                    ({(measureResult.distanceKm * 0.539957).toFixed(2)} nmi)
                  </span>
                </span>
              </div>
              <div className="flex gap-4">
                <span style={{ color: '#00E5FF' }}>Bearing</span>
                <span className="text-gray-200">{measureResult.bearingDeg.toFixed(1)}&deg;</span>
              </div>
              <div className="flex gap-4">
                <span style={{ color: '#4A5568' }}>From</span>
                <span className="text-gray-400">
                  {measureResult.from.lat.toFixed(4)}, {measureResult.from.lon.toFixed(4)}
                </span>
              </div>
              <div className="flex gap-4">
                <span style={{ color: '#4A5568' }}>To</span>
                <span className="text-gray-400">
                  {measureResult.to.lat.toFixed(4)}, {measureResult.to.lon.toFixed(4)}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  clearMeasure();
                  setMeasureMode(true);
                }}
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: 'rgba(0,229,255,0.15)', color: '#00E5FF' }}
              >
                New
              </button>
              <button
                onClick={clearMeasure}
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: 'rgba(255,87,34,0.15)', color: '#FF5722' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
