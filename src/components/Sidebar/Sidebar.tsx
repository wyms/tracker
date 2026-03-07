import { useState, useMemo } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../../services/firebase';
import { useAppStore, type LayerState } from '../../store/useAppStore';
import { FLIGHT_REGIONS } from '../../data/flightRegions';

const layerConfig: { key: keyof LayerState; label: string; color: string; shortcut: string }[] = [
  { key: 'flights', label: 'Flights', color: '#00E5FF', shortcut: '1' },
  { key: 'satellites', label: 'Satellites', color: '#FFEB3B', shortcut: '2' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF5722', shortcut: '3' },
  { key: 'cameras', label: 'Cameras', color: '#FF6B35', shortcut: '4' },
  { key: 'weather', label: 'Weather', color: '#64B5F6', shortcut: '5' },
  { key: 'labels', label: 'Labels', color: '#FFFFFF', shortcut: '6' },
];

export function Sidebar() {
  const { layers, toggleLayer, entityCounts, user, flightRegion, setFlightRegion } = useAppStore();
  const [showNudge, setShowNudge] = useState(false);

  const regionGroups = useMemo(() => {
    const groups: { label: string; regions: typeof FLIGHT_REGIONS }[] = [];
    for (const r of FLIGHT_REGIONS) {
      let group = groups.find((g) => g.label === r.group);
      if (!group) {
        group = { label: r.group, regions: [] };
        groups.push(group);
      }
      group.regions.push(r);
    }
    return groups;
  }, []);

  const handleToggle = (key: keyof LayerState) => {
    if (key === 'flights' && !user && !layers.flights) {
      setShowNudge(true);
      setTimeout(() => setShowNudge(false), 4000);
    }
    toggleLayer(key);
  };

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
              <div key={key}>
                <button
                  onClick={() => handleToggle(key)}
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
                {key === 'flights' && layers.flights && (
                  <select
                    value={flightRegion}
                    onChange={(e) => setFlightRegion(e.target.value)}
                    className="mt-1.5 ml-5 w-[calc(100%-1.25rem)] text-xs rounded px-2 py-1 font-mono outline-none cursor-pointer"
                    style={{
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid rgba(0,229,255,0.3)',
                      color: '#00E5FF',
                    }}
                  >
                    {regionGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.regions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {/* Anonymous flights nudge */}
        {showNudge && !user && (
          <p className="text-xs mt-3 px-1" style={{ color: '#FFEB3B' }}>
            Limited to 50 aircraft. Sign in for full access.
          </p>
        )}

        {/* Auth section — only show if Firebase is configured */}
        {auth && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: 'rgba(0,229,255,0.15)' }}>
            {user ? (
              <div className="flex items-center gap-2">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                )}
                <span className="text-xs truncate flex-1" style={{ color: '#9CA3AF' }}>
                  {user.displayName || 'Signed in'}
                </span>
                <button
                  onClick={() => { if (auth) signOut(auth); }}
                  className="text-xs hover:underline"
                  style={{ color: '#FF5722' }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (auth && googleProvider) {
                    signInWithPopup(auth, googleProvider).catch((err) => {
                      console.error('Google sign-in failed:', err);
                      useAppStore.getState().addNotification({
                        type: 'warning',
                        title: 'Sign-in Failed',
                        message: err.code === 'auth/popup-blocked'
                          ? 'Popup was blocked. Allow popups and try again.'
                          : err.message || 'Could not sign in with Google',
                      });
                    });
                  }
                }}
                className="w-full text-xs font-medium py-1.5 rounded transition-colors"
                style={{ background: 'rgba(0,229,255,0.15)', color: '#00E5FF' }}
              >
                Sign in with Google
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
