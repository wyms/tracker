import { useEffect } from 'react';
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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

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
        // Auto-enable flights layer on sign-in
        const { layers, toggleLayer } = useAppStore.getState();
        if (!layers.flights) toggleLayer('flights');
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
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: '#0D1B2A' }}>
      <Globe />
      <Clock />
      <FilterBar />
      <FlyToInput />
      <Sidebar />
      <BookmarkPanel />
      <EarthquakePanel />
      <SearchPanel />
      <HUD />
      <InfoPanel />
      <StatsPanel />
      <Toolbar />
      <MeasureTool />
      <NotificationToast />
      <StatusBar />
    </div>
  );
}

export default App;
