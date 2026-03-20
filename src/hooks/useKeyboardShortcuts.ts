import { useEffect } from 'react';
import { useAppStore, type FilterMode } from '../store/useAppStore';

const filterOrder: FilterMode[] = ['normal', 'flir', 'nightvision', 'crt'];

export function useKeyboardShortcuts() {
  const {
    toggleLayer,
    activeFilter,
    setActiveFilter,
    setSelectedEntity,
    requestScreenshot,
    measureMode,
    setMeasureMode,
    clearMeasure,
    toggleTrails,
  } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case '1':
          toggleLayer('flights');
          break;
        case '2':
          toggleLayer('satellites');
          break;
        case '3':
          toggleLayer('earthquakes');
          break;
        case '4':
          toggleLayer('cameras');
          break;
        case '5':
          toggleLayer('weather');
          break;
        case '6':
          toggleLayer('labels');
          break;
        case '7':
          toggleLayer('groundStops');
          break;
        case '8':
          toggleLayer('fires');
          break;
        case '9':
          toggleLayer('gdelt');
          break;
        case '0':
          toggleLayer('radiation');
          break;
        case 'f':
        case 'F': {
          const idx = filterOrder.indexOf(activeFilter);
          setActiveFilter(filterOrder[(idx + 1) % filterOrder.length]);
          break;
        }
        case 'Escape':
          if (measureMode) {
            clearMeasure();
          } else {
            setSelectedEntity(null);
          }
          break;
        case 'p':
        case 'P':
          requestScreenshot();
          break;
        case 'm':
        case 'M':
          if (measureMode) {
            clearMeasure();
          } else {
            setMeasureMode(true);
          }
          break;
        case 't':
        case 'T':
          toggleTrails();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    activeFilter,
    measureMode,
    toggleLayer,
    setActiveFilter,
    setSelectedEntity,
    requestScreenshot,
    setMeasureMode,
    clearMeasure,
    toggleTrails,
  ]);
}
