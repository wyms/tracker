import { useState, useEffect } from 'react';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const utc = now.toISOString().slice(11, 19);
  const local = now.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now.toISOString().slice(0, 10);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <div
        className="rounded-lg px-5 py-2 border backdrop-blur-sm text-center"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <div className="text-xs font-mono" style={{ color: '#4A5568' }}>
          {dateStr}
        </div>
        <div className="flex items-baseline gap-4">
          <div>
            <span
              className="text-lg font-mono font-bold tracking-wider"
              style={{ color: '#00E5FF' }}
            >
              {utc}
            </span>
            <span className="text-xs font-mono ml-1" style={{ color: '#00E5FF', opacity: 0.6 }}>
              Z
            </span>
          </div>
          <div>
            <span className="text-sm font-mono text-gray-400">{local}</span>
            <span className="text-xs font-mono ml-1 text-gray-500">L</span>
          </div>
        </div>
      </div>
    </div>
  );
}
