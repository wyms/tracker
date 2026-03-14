import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { EarthquakeFeature } from '../../services/usgs';

function magColor(mag: number): string {
  if (mag < 3) return '#00FF88';
  if (mag < 5) return '#FACC15';
  if (mag < 7) return '#F97316';
  return '#EF4444';
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function EarthquakePanel() {
  const earthquakeList = useAppStore((s) => s.earthquakeList);
  const setFlyToTarget = useAppStore((s) => s.setFlyToTarget);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const [open, setOpen] = useState(false);

  const sorted = [...earthquakeList].sort(
    (a, b) => (b.properties.mag ?? 0) - (a.properties.mag ?? 0)
  );

  const handleClick = (quake: EarthquakeFeature) => {
    const [lon, lat, depth] = quake.geometry.coordinates;
    const mag = quake.properties.mag ?? 0;

    setFlyToTarget({ lon, lat, alt: 50000 });
    setSelectedEntity({
      type: 'earthquake',
      id: `quake-${quake.id}`,
      data: {
        mag,
        place: quake.properties.place,
        time: quake.properties.time,
        depth,
        url: quake.properties.url,
        title: quake.properties.title,
      },
    });
  };

  return (
    <div className="absolute top-16 left-[26rem] z-10 hidden md:block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg px-3 py-2 border backdrop-blur-sm text-xs font-mono"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: open ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.2)',
          color: '#00E5FF',
        }}
      >
        Quakes ({earthquakeList.length})
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border backdrop-blur-sm w-80 overflow-hidden"
          style={{
            background: 'rgba(13,27,42,0.95)',
            borderColor: 'rgba(0,229,255,0.2)',
          }}
        >
          {sorted.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {sorted.map((quake) => {
                const mag = quake.properties.mag ?? 0;
                return (
                  <button
                    key={quake.id}
                    onClick={() => handleClick(quake)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"
                  >
                    <span
                      className="shrink-0 w-10 text-center text-xs font-mono font-bold rounded py-0.5"
                      style={{
                        background: `${magColor(mag)}22`,
                        color: magColor(mag),
                      }}
                    >
                      {mag.toFixed(1)}
                    </span>
                    <span className="flex-1 text-xs font-mono text-gray-300 truncate">
                      {quake.properties.place ?? 'Unknown'}
                    </span>
                    <span className="shrink-0 text-xs font-mono text-gray-600">
                      {timeAgo(quake.properties.time)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-gray-600 font-mono">
              No earthquake data yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
