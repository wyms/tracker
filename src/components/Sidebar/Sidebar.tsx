import { useState, useMemo, useEffect } from 'react';
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
  { key: 'groundStops', label: 'Ground Stops', color: '#FF1744', shortcut: '7' },
  { key: 'fires', label: 'Fires', color: '#FF6600', shortcut: '8' },
  { key: 'gdelt', label: 'GDELT Events', color: '#E040FB', shortcut: '9' },
  { key: 'radiation', label: 'Radiation', color: '#76FF03', shortcut: '0' },
  { key: 'eonet', label: 'Natural Events', color: '#FF4500', shortcut: '' },
  { key: 'artemis', label: 'Artemis II', color: '#FF8C00', shortcut: '' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export function Sidebar() {
  const { layers, toggleLayer, entityCounts, user, flightRegion, setFlightRegion, setUserLocation, setFlyToTarget, addNotification } = useAppStore();
  const [showNudge, setShowNudge] = useState(false);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(!isMobile);

  // Auto-close when switching to mobile, auto-open on desktop
  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

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

  const handleNearMe = () => {
    if (!user) {
      if (auth && googleProvider) {
        signInWithPopup(auth, googleProvider).catch((err) => {
          console.error('Google sign-in failed:', err);
          addNotification({
            type: 'warning',
            title: 'Sign-in Failed',
            message: err.code === 'auth/popup-blocked'
              ? 'Popup was blocked. Allow popups and try again.'
              : err.message || 'Could not sign in with Google',
          });
        });
      }
      return;
    }
    if (!navigator.geolocation) {
      addNotification({ type: 'warning', title: 'Geolocation', message: 'Geolocation is not supported by your browser' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserLocation(loc);
        setFlightRegion('nearme');
        setFlyToTarget({ lat: loc.lat, lon: loc.lon, alt: 150000 });
        addNotification({ type: 'success', title: 'Near Me', message: 'Showing 50 closest aircraft' });
      },
      (err) => {
        addNotification({ type: 'warning', title: 'Location Denied', message: err.message || 'Could not get your location' });
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const handleRegionChange = (value: string) => {
    setUserLocation(null);
    setFlightRegion(value);
    const region = FLIGHT_REGIONS.find((r) => r.id === value);
    if (region?.bbox) {
      const lat = (region.bbox.south + region.bbox.north) / 2;
      const lon = (region.bbox.west + region.bbox.east) / 2;
      const span = Math.max(region.bbox.north - region.bbox.south, region.bbox.east - region.bbox.west);
      const alt = span * 80000;
      setFlyToTarget({ lat, lon, alt });
    }
  };

  const handleToggle = (key: keyof LayerState) => {
    if (key === 'flights' && !user && !layers.flights) {
      setShowNudge(true);
      setTimeout(() => setShowNudge(false), 4000);
    }
    toggleLayer(key);
  };

  return (
    <>
      {/* Hamburger toggle — visible on mobile when sidebar is closed */}
      {isMobile && !open && (
        <button
          onClick={() => setOpen(true)}
          className="absolute top-4 left-4 z-20 p-2 rounded-lg border backdrop-blur-sm"
          style={{
            background: 'rgba(13,27,42,0.9)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00E5FF',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      )}

      {/* Backdrop — mobile only, closes sidebar on tap */}
      {isMobile && open && (
        <div
          className="fixed inset-0 z-10"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`absolute top-16 left-4 z-20 w-56 transition-all duration-200 ${
          open ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'
        }`}
        style={isMobile ? { top: '0.5rem' } : undefined}
      >
        <div
          className="rounded-lg p-4 border backdrop-blur-sm overflow-y-auto"
          style={{
            background: 'rgba(13,27,42,0.95)',
            borderColor: 'rgba(0,229,255,0.2)',
            maxHeight: 'calc(100dvh - 6rem)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: '#00E5FF' }}
            >
              Data Layers
            </h2>
            {isMobile && (
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none"
              >
                &times;
              </button>
            )}
          </div>
          <div className="space-y-1.5">
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
                    <div className="mt-1.5 ml-5 w-[calc(100%-1.25rem)] flex gap-1.5">
                      <select
                        value={flightRegion === 'nearme' ? 'nearme' : flightRegion}
                        onChange={(e) => handleRegionChange(e.target.value)}
                        className="flex-1 min-w-0 text-xs rounded px-2 py-1 font-mono outline-none cursor-pointer"
                        style={{
                          background: 'rgba(0,229,255,0.08)',
                          border: '1px solid rgba(0,229,255,0.3)',
                          color: '#00E5FF',
                        }}
                      >
                        {flightRegion === 'nearme' && (
                          <option value="nearme">Near Me</option>
                        )}
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
                      <button
                        onClick={handleNearMe}
                        title={user ? 'Show 50 closest aircraft to your location' : 'Sign in to use Near Me'}
                        className="text-xs px-2 py-1 rounded font-mono shrink-0"
                        style={{
                          background: !user
                            ? 'rgba(255,235,59,0.1)'
                            : flightRegion === 'nearme' ? 'rgba(0,229,255,0.25)' : 'rgba(0,229,255,0.08)',
                          border: `1px solid ${!user ? 'rgba(255,235,59,0.3)' : 'rgba(0,229,255,0.3)'}`,
                          color: !user ? '#FFEB3B' : '#00E5FF',
                        }}
                      >
                        {user ? 'Near Me' : '🔒 Near Me'}
                      </button>
                    </div>
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
    </>
  );
}
