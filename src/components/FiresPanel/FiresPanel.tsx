import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { FireHotspot } from '../../services/firms';

function frpColor(frp: number): string {
  if (frp < 10) return '#FACC15';
  if (frp < 50) return '#F97316';
  if (frp < 200) return '#FF4500';
  return '#EF4444';
}

function timeLabel(acq_date: string, acq_time: string): string {
  if (!acq_date) return '';
  const hh = acq_time.padStart(4, '0').slice(0, 2);
  const mm = acq_time.padStart(4, '0').slice(2, 4);
  return `${acq_date.slice(5)} ${hh}:${mm}`;
}

function locationLabel(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}${ns} ${Math.abs(lon).toFixed(2)}${ew}`;
}

export function FiresPanel() {
  const fireList = useAppStore((s) => s.fireList);
  const setFlyToTarget = useAppStore((s) => s.setFlyToTarget);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const [open, setOpen] = useState(false);

  // Top 100 by FRP (brightness/intensity)
  const top100 = [...fireList]
    .sort((a, b) => b.frp - a.frp)
    .slice(0, 100);

  const handleClick = (h: FireHotspot) => {
    setFlyToTarget({ lon: h.longitude, lat: h.latitude, alt: 50000 });
    setSelectedEntity({
      type: 'fire',
      id: `fire-${h.latitude}-${h.longitude}`,
      data: {
        latitude: h.latitude,
        longitude: h.longitude,
        brightness: h.brightness,
        frp: h.frp,
        confidence: h.confidence,
        acq_date: h.acq_date,
        acq_time: h.acq_time,
        satellite: h.satellite,
        daynight: h.daynight,
      },
    });
  };

  return (
    <div className="absolute top-16 left-[31rem] z-10 hidden md:block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg px-3 py-2 border backdrop-blur-sm text-xs font-mono"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: open ? 'rgba(255,102,0,0.4)' : 'rgba(255,102,0,0.2)',
          color: '#FF6600',
        }}
      >
        Fires ({fireList.length})
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border backdrop-blur-sm w-80 overflow-hidden"
          style={{
            background: 'rgba(13,27,42,0.95)',
            borderColor: 'rgba(255,102,0,0.2)',
          }}
        >
          {top100.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {top100.map((h, i) => (
                <button
                  key={`${h.latitude}-${h.longitude}-${i}`}
                  onClick={() => handleClick(h)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"
                >
                  <span
                    className="shrink-0 w-14 text-center text-xs font-mono font-bold rounded py-0.5"
                    style={{
                      background: `${frpColor(h.frp)}22`,
                      color: frpColor(h.frp),
                    }}
                  >
                    {h.frp.toFixed(0)} MW
                  </span>
                  <span className="flex-1 text-xs font-mono text-gray-300 truncate">
                    {locationLabel(h.latitude, h.longitude)}
                  </span>
                  <span className="shrink-0 text-xs font-mono text-gray-600">
                    {timeLabel(h.acq_date, h.acq_time)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-gray-600 font-mono">
              No fire data yet &mdash; toggle Fires layer on
            </div>
          )}
        </div>
      )}
    </div>
  );
}
