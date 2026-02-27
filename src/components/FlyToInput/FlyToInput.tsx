import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

export function FlyToInput() {
  const { setFlyToTarget } = useAppStore();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const presets = [
    { name: 'New York', lat: 40.7128, lon: -74.006 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { name: 'ISS Orbit', lat: 0, lon: 0 },
  ];

  const handleGo = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Try parsing "lat, lon" or "lat lon"
    const parts = trimmed.split(/[\s,]+/).map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const alt = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 50000;
      setFlyToTarget({ lat: parts[0], lon: parts[1], alt });
      setInput('');
      setOpen(false);
      return;
    }

    // Try matching a preset
    const preset = presets.find(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (preset) {
      setFlyToTarget({ lat: preset.lat, lon: preset.lon, alt: 50000 });
      setInput('');
      setOpen(false);
    }
  };

  return (
    <div className="absolute top-4 right-52 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg px-3 py-2 border backdrop-blur-sm text-xs font-mono"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: open ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.2)',
          color: '#00E5FF',
        }}
      >
        Go To
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border backdrop-blur-sm w-56 overflow-hidden"
          style={{
            background: 'rgba(13,27,42,0.95)',
            borderColor: 'rgba(0,229,255,0.2)',
          }}
        >
          <div className="p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
              placeholder="lat, lon or city name"
              className="w-full bg-transparent text-xs font-mono text-gray-300 outline-none px-2 py-1.5 rounded border"
              style={{ borderColor: 'rgba(0,229,255,0.2)' }}
              autoFocus
            />
          </div>
          <div style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}>
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setFlyToTarget({ lat: p.lat, lon: p.lon, alt: 50000 });
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 hover:bg-white/5"
              >
                {p.name}
                <span className="text-gray-600 ml-2">
                  {p.lat.toFixed(1)}, {p.lon.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
