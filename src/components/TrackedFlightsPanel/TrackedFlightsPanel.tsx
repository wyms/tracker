import { useState, useEffect } from 'react';
import { firestore } from '../../services/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';

interface TrackedFlight {
  id: string;
  callsign: string;
  icao24: string;
  latitude: number | null;
  longitude: number | null;
  baro_altitude: number | null;
  velocity: number | null;
  true_track: number | null;
  on_ground: boolean;
  timestamp: number;
}

export function TrackedFlightsPanel() {
  const [flights, setFlights] = useState<TrackedFlight[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    const q = query(
      collection(firestore, 'tracked-flights'),
      orderBy('timestamp', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as TrackedFlight[];
        setFlights(docs);
      },
      (err) => {
        console.error('TrackedFlightsPanel snapshot error:', err);
      },
    );

    return unsub;
  }, []);

  // Group by callsign, show most recent first
  const grouped = new Map<string, TrackedFlight[]>();
  for (const f of flights) {
    const list = grouped.get(f.callsign) ?? [];
    list.push(f);
    grouped.set(f.callsign, list);
  }

  return (
    <div className="absolute bottom-52 left-4 z-10 w-72 hidden md:block">
      <div
        className="rounded-lg border backdrop-blur-sm overflow-hidden"
        style={{
          background: 'rgba(13,27,42,0.95)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2"
          style={{ borderBottom: expanded ? '1px solid rgba(0,229,255,0.15)' : 'none' }}
        >
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: '#00E5FF' }}
          >
            Tracked Aircraft
          </span>
          <span className="text-gray-500 text-xs">{expanded ? '−' : '+'}</span>
        </button>

        {expanded && (
          <div className="max-h-64 overflow-y-auto">
            {flights.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-500 font-mono">
                No sightings yet. Polling every 30 min.
              </div>
            ) : (
              [...grouped.entries()].map(([callsign, entries]) => (
                <div
                  key={callsign}
                  style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}
                >
                  <div className="px-4 pt-2 pb-1">
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: '#00E5FF' }}
                    >
                      {callsign}
                    </span>
                    <span className="text-xs text-gray-600 ml-2 font-mono">
                      {entries[0].icao24}
                    </span>
                  </div>
                  {entries.map((f) => (
                    <div key={f.id} className="px-4 py-1 flex justify-between text-xs">
                      <span className="text-gray-500 font-mono">
                        {new Date(f.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-gray-300 font-mono">
                        {f.on_ground
                          ? 'Ground'
                          : f.baro_altitude != null
                            ? `${Math.round(f.baro_altitude * 3.281)}ft`
                            : '—'}
                        {f.velocity != null && !f.on_ground
                          ? ` ${Math.round(f.velocity * 1.944)}kt`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
