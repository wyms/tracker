import { Component, useEffect, type ReactNode, type ErrorInfo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './services/firebase';
import { useAppStore } from './store/useAppStore';
import { Globe } from './components/Globe/Globe';
import { Sidebar } from './components/Sidebar/Sidebar';
import { HUD } from './components/HUD/HUD';
import { InfoPanel } from './components/InfoPanel/InfoPanel';
import { FilterBar } from './components/FilterBar/FilterBar';
import { StatusBar } from './components/StatusBar/StatusBar';
import { SearchPanel } from './components/SearchPanel/SearchPanel';
import { Clock } from './components/Clock/Clock';
import { StatsPanel } from './components/StatsPanel/StatsPanel';
import { Toolbar } from './components/Toolbar/Toolbar';
import { BookmarkPanel } from './components/BookmarkPanel/BookmarkPanel';
import { EarthquakePanel } from './components/EarthquakePanel/EarthquakePanel';
import { FlyToInput } from './components/FlyToInput/FlyToInput';
import { MeasureTool } from './components/MeasureTool/MeasureTool';
import { NotificationToast } from './components/NotificationToast/NotificationToast';
import { TrackedFlightsPanel } from './components/TrackedFlightsPanel/TrackedFlightsPanel';
import { FiresPanel } from './components/FiresPanel/FiresPanel';
import { MarketTicker } from './components/MarketTicker/MarketTicker';
import { SanctionsPanel } from './components/SanctionsPanel/SanctionsPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0D1B2A',
          color: '#c8d6e5',
          fontFamily: 'monospace',
        }}>
          <h1 style={{ color: '#00E5FF', marginBottom: '16px' }}>Something went wrong</h1>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px',
              background: 'rgba(0,229,255,0.15)',
              border: '1px solid rgba(0,229,255,0.4)',
              borderRadius: '8px',
              color: '#00E5FF',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  useKeyboardShortcuts();

  const setUser = useAppStore((s) => s.setUser);
  const setApiUsage = useAppStore((s) => s.setApiUsage);

  // Firebase auth listener
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        // Auto-enable core layers on sign-in
        const { layers, toggleLayer } = useAppStore.getState();
        if (!layers.flights) toggleLayer('flights');
        if (!layers.satellites) toggleLayer('satellites');
        if (!layers.cameras) toggleLayer('cameras');
        if (!layers.groundStops) toggleLayer('groundStops');

        // Track sign-in on backend (user table + email notification)
        firebaseUser.getIdToken().then((token) => {
          fetch('/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }).catch(() => { /* non-critical */ });
        }).catch(() => { /* non-critical */ });
      } else {
        setUser(null);
        setApiUsage(null);
        // Flights stay on but downgrade to anonymous tier (50 cap, 30s poll)
      }
    });
  }, [setUser, setApiUsage]);

  // Poll API usage for authenticated users
  useEffect(() => {
    async function fetchUsage() {
      const { user } = useAppStore.getState();
      if (!user) return;
      try {
        const res = await fetch('/api/usage');
        if (res.ok) {
          const data = await res.json();
          setApiUsage({ calls: data.openSkyCalls, limit: data.limit, remaining: data.remaining });
        }
      } catch { /* ignore */ }
    }

    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, [setApiUsage]);

  return (
    <ErrorBoundary>
      <div className="w-screen h-screen overflow-hidden relative" style={{ background: '#0D1B2A' }}>
        <Globe />
        <Clock />
        <FilterBar />
        <FlyToInput />
        <Sidebar />
        <BookmarkPanel />
        <EarthquakePanel />
        <FiresPanel />
        <SearchPanel />
        <HUD />
        <InfoPanel />
        <StatsPanel />
        <Toolbar />
        <MeasureTool />
        <NotificationToast />
        <TrackedFlightsPanel />
        <MarketTicker />
        <SanctionsPanel />
        <StatusBar />
      </div>
    </ErrorBoundary>
  );
}

export default App;
