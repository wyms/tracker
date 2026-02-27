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
import { FlyToInput } from './components/FlyToInput/FlyToInput';
import { MeasureTool } from './components/MeasureTool/MeasureTool';
import { NotificationToast } from './components/NotificationToast/NotificationToast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  useKeyboardShortcuts();

  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: '#0D1B2A' }}>
      <Globe />
      <Clock />
      <FilterBar />
      <FlyToInput />
      <Sidebar />
      <BookmarkPanel />
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
