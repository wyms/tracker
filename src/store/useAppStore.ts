import { create } from 'zustand';
import type { AircraftState, HistoricalFlight, FlightTrack } from '../services/opensky';
import type { EarthquakeFeature } from '../services/usgs';

export type FilterMode = 'normal' | 'flir' | 'nightvision' | 'crt';

export type SearchStatus = 'idle' | 'searching' | 'resolving' | 'loading_history' | 'loading_track' | 'error';

export interface AppUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

export interface ApiUsage {
  calls: number;
  limit: number;
  remaining: number;
}

export interface LayerState {
  flights: boolean;
  satellites: boolean;
  earthquakes: boolean;
  cameras: boolean;
  weather: boolean;
  labels: boolean;
  groundStops: boolean;
  fires: boolean;
}

export interface DataTimestamp {
  flights: number | null;
  satellites: number | null;
  earthquakes: number | null;
  cameras: number | null;
  weather: number | null;
  groundStops: number | null;
  fires: number | null;
}

export interface SelectedEntity {
  type: 'aircraft' | 'satellite' | 'earthquake' | 'camera' | 'groundStop' | 'fire';
  id: string;
  data: Record<string, unknown>;
}

export interface CameraPosition {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface FlyToTarget {
  lon: number;
  lat: number;
  alt: number;
}

export interface EntityCounts {
  flights: number;
  satellites: number;
  earthquakes: number;
  cameras: number;
  groundStops: number;
  fires: number;
}

export interface Bookmark {
  id: string;
  name: string;
  position: CameraPosition;
  createdAt: number;
}

export interface MeasurePoint {
  lat: number;
  lon: number;
}

export interface MeasureResult {
  from: MeasurePoint;
  to: MeasurePoint;
  distanceKm: number;
  bearingDeg: number;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  timestamp: number;
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

  // Entity counts
  entityCounts: EntityCounts;
  setEntityCount: (layer: keyof EntityCounts, count: number) => void;

  // Flight region
  flightRegion: string;
  setFlightRegion: (region: string) => void;

  // User geolocation
  userLocation: { lat: number; lon: number } | null;
  setUserLocation: (loc: { lat: number; lon: number } | null) => void;

  // Trails
  trailsEnabled: boolean;
  toggleTrails: () => void;

  // Bookmarks
  bookmarks: Bookmark[];
  addBookmark: (name: string) => void;
  removeBookmark: (id: string) => void;
  loadBookmarks: () => void;

  // Measurement
  measureMode: boolean;
  setMeasureMode: (active: boolean) => void;
  measurePoints: MeasurePoint[];
  addMeasurePoint: (point: MeasurePoint) => void;
  measureResult: MeasureResult | null;
  setMeasureResult: (result: MeasureResult | null) => void;
  clearMeasure: () => void;

  // Notifications
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;

  // Screenshot
  screenshotRequested: boolean;
  requestScreenshot: () => void;
  clearScreenshotRequest: () => void;

  // Search state
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchStatus: SearchStatus;
  setSearchStatus: (status: SearchStatus) => void;
  searchError: string | null;
  setSearchError: (error: string | null) => void;
  searchResults: AircraftState[];
  setSearchResults: (results: AircraftState[]) => void;
  selectedSearchResult: AircraftState | null;
  setSelectedSearchResult: (result: AircraftState | null) => void;
  historicalFlights: HistoricalFlight[];
  setHistoricalFlights: (flights: HistoricalFlight[]) => void;
  activeTrack: FlightTrack | null;
  setActiveTrack: (track: FlightTrack | null) => void;
  activeHistoricalFlight: HistoricalFlight | null;
  setActiveHistoricalFlight: (flight: HistoricalFlight | null) => void;
  searchDateRange: { begin: Date; end: Date };
  setSearchDateRange: (range: { begin: Date; end: Date }) => void;
  flyToTarget: FlyToTarget | null;
  setFlyToTarget: (target: FlyToTarget | null) => void;
  resolvedIcao24: string | null;
  setResolvedIcao24: (icao24: string | null) => void;
  clearSearch: () => void;

  // Earthquake list
  earthquakeList: EarthquakeFeature[];
  setEarthquakeList: (list: EarthquakeFeature[]) => void;

  // Auth
  user: AppUser | null;
  setUser: (user: AppUser | null) => void;

  // API usage
  apiUsage: ApiUsage | null;
  setApiUsage: (usage: ApiUsage | null) => void;
}

function loadBookmarksFromStorage(): Bookmark[] {
  try {
    const raw = localStorage.getItem('gcc-bookmarks');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBookmarksToStorage(bookmarks: Bookmark[]) {
  localStorage.setItem('gcc-bookmarks', JSON.stringify(bookmarks));
}

let notificationCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  layers: {
    flights: true,
    satellites: true,
    earthquakes: true,
    cameras: true,
    weather: false,
    labels: false,
    groundStops: true,
    fires: false,
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
    weather: null,
    groundStops: null,
    fires: null,
  },
  setDataTimestamp: (layer, time) =>
    set((state) => ({
      dataTimestamps: { ...state.dataTimestamps, [layer]: time },
    })),

  // Entity counts
  entityCounts: { flights: 0, satellites: 0, earthquakes: 0, cameras: 0, groundStops: 0, fires: 0 },
  setEntityCount: (layer, count) =>
    set((state) => ({
      entityCounts: { ...state.entityCounts, [layer]: count },
    })),

  // Flight region
  flightRegion: 'viewport',
  setFlightRegion: (region) => set({ flightRegion: region }),

  // User geolocation
  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),

  // Trails
  trailsEnabled: true,
  toggleTrails: () => set((state) => ({ trailsEnabled: !state.trailsEnabled })),

  // Bookmarks
  bookmarks: loadBookmarksFromStorage(),
  addBookmark: (name) => {
    const { cameraPosition, bookmarks } = get();
    const newBookmark: Bookmark = {
      id: `bm-${Date.now()}`,
      name,
      position: { ...cameraPosition },
      createdAt: Date.now(),
    };
    const updated = [...bookmarks, newBookmark];
    while (updated.length > 50) updated.shift();
    saveBookmarksToStorage(updated);
    set({ bookmarks: updated });
  },
  removeBookmark: (id) => {
    const updated = get().bookmarks.filter((b) => b.id !== id);
    saveBookmarksToStorage(updated);
    set({ bookmarks: updated });
  },
  loadBookmarks: () => set({ bookmarks: loadBookmarksFromStorage() }),

  // Measurement
  measureMode: false,
  setMeasureMode: (active) => set({ measureMode: active, measurePoints: [], measureResult: null }),
  measurePoints: [],
  addMeasurePoint: (point) => {
    const { measurePoints } = get();
    if (measurePoints.length >= 2) return;
    const updated = [...measurePoints, point];
    set({ measurePoints: updated });

    if (updated.length === 2) {
      const [from, to] = updated;
      const R = 6371;
      const dLat = (to.lat - from.lat) * Math.PI / 180;
      const dLon = (to.lon - from.lon) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(from.lat * Math.PI / 180) *
        Math.cos(to.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;

      const y = Math.sin(dLon) * Math.cos(to.lat * Math.PI / 180);
      const x =
        Math.cos(from.lat * Math.PI / 180) * Math.sin(to.lat * Math.PI / 180) -
        Math.sin(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.cos(dLon);
      const bearingDeg = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

      set({ measureResult: { from, to, distanceKm, bearingDeg } });
    }
  },
  measureResult: null,
  setMeasureResult: (result) => set({ measureResult: result }),
  clearMeasure: () => set({ measureMode: false, measurePoints: [], measureResult: null }),

  // Notifications
  notifications: [],
  addNotification: (n) => {
    const id = `notif-${++notificationCounter}`;
    const notification: AppNotification = { ...n, id, timestamp: Date.now() };
    set((state) => ({
      notifications: [...state.notifications, notification].slice(-5),
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((x) => x.id !== id),
      }));
    }, 6000);
  },
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Screenshot
  screenshotRequested: false,
  requestScreenshot: () => set({ screenshotRequested: true }),
  clearScreenshotRequest: () => set({ screenshotRequested: false }),

  // Search state
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchStatus: 'idle',
  setSearchStatus: (status) => set({ searchStatus: status }),
  searchError: null,
  setSearchError: (error) => set({ searchError: error }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  selectedSearchResult: null,
  setSelectedSearchResult: (result) => set({ selectedSearchResult: result }),
  historicalFlights: [],
  setHistoricalFlights: (flights) => set({ historicalFlights: flights }),
  activeTrack: null,
  setActiveTrack: (track) => set({ activeTrack: track }),
  activeHistoricalFlight: null,
  setActiveHistoricalFlight: (flight) => set({ activeHistoricalFlight: flight }),
  searchDateRange: {
    begin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date(),
  },
  setSearchDateRange: (range) => set({ searchDateRange: range }),
  flyToTarget: null,
  setFlyToTarget: (target) => set({ flyToTarget: target }),
  resolvedIcao24: null,
  setResolvedIcao24: (icao24) => set({ resolvedIcao24: icao24 }),
  clearSearch: () =>
    set({
      searchQuery: '',
      searchStatus: 'idle',
      searchError: null,
      searchResults: [],
      selectedSearchResult: null,
      historicalFlights: [],
      activeTrack: null,
      activeHistoricalFlight: null,
      flyToTarget: null,
      resolvedIcao24: null,
    }),

  // Earthquake list
  earthquakeList: [],
  setEarthquakeList: (list) => set({ earthquakeList: list }),

  // Auth
  user: null,
  setUser: (user) => set({ user }),

  // API usage
  apiUsage: null,
  setApiUsage: (apiUsage) => set({ apiUsage }),
}));
