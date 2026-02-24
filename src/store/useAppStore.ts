import { create } from 'zustand';

export type FilterMode = 'normal' | 'flir' | 'nightvision' | 'crt';

export interface LayerState {
  flights: boolean;
  satellites: boolean;
  earthquakes: boolean;
  cameras: boolean;
}

export interface DataTimestamp {
  flights: number | null;
  satellites: number | null;
  earthquakes: number | null;
  cameras: number | null;
}

export interface SelectedEntity {
  type: 'aircraft' | 'satellite' | 'earthquake' | 'camera';
  id: string;
  data: Record<string, unknown>;
}

export interface CameraPosition {
  latitude: number;
  longitude: number;
  altitude: number;
}

interface AppState {
  layers: LayerState;
  toggleLayer: (layer: keyof LayerState) => void;

  activeFilter: FilterMode;
  setActiveFilter: (filter: FilterMode) => void;

  selectedEntity: SelectedEntity | null;
  setSelectedEntity: (entity: SelectedEntity | null) => void;

  cameraPosition: CameraPosition;
  setCameraPosition: (pos: CameraPosition) => void;

  dataTimestamps: DataTimestamp;
  setDataTimestamp: (layer: keyof DataTimestamp, time: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  layers: {
    flights: true,
    satellites: true,
    earthquakes: true,
    cameras: true,
  },
  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),

  activeFilter: 'normal',
  setActiveFilter: (filter) => set({ activeFilter: filter }),

  selectedEntity: null,
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  cameraPosition: { latitude: 0, longitude: 0, altitude: 10000000 },
  setCameraPosition: (pos) => set({ cameraPosition: pos }),

  dataTimestamps: {
    flights: null,
    satellites: null,
    earthquakes: null,
    cameras: null,
  },
  setDataTimestamp: (layer, time) =>
    set((state) => ({
      dataTimestamps: { ...state.dataTimestamps, [layer]: time },
    })),
}));
