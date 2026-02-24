import { Globe } from './components/Globe/Globe';
import { Sidebar } from './components/Sidebar/Sidebar';
import { HUD } from './components/HUD/HUD';
import { InfoPanel } from './components/InfoPanel/InfoPanel';
import { FilterBar } from './components/FilterBar/FilterBar';
import { StatusBar } from './components/StatusBar/StatusBar';

function App() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: '#0D1B2A' }}>
      <Globe />
      <FilterBar />
      <Sidebar />
      <HUD />
      <InfoPanel />
      <StatusBar />
    </div>
  );
}

export default App;
