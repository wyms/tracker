import type { BoundingBox } from '../services/opensky';

export interface FlightRegion {
  id: string;
  label: string;
  group: string;
  bbox: BoundingBox | null;
}

export const FLIGHT_REGIONS: FlightRegion[] = [
  // Special
  { id: 'viewport', label: 'Viewport (camera)', group: 'Special', bbox: null },
  { id: 'nearme', label: 'Near Me', group: 'Special', bbox: null },
  { id: 'world', label: 'World (all)', group: 'Special', bbox: null },

  // Continents
  { id: 'north-america', label: 'North America', group: 'Continents', bbox: { south: 5, west: -170, north: 72, east: -50 } },
  { id: 'south-america', label: 'South America', group: 'Continents', bbox: { south: -56, west: -82, north: 13, east: -34 } },
  { id: 'europe', label: 'Europe', group: 'Continents', bbox: { south: 35, west: -12, north: 72, east: 45 } },
  { id: 'africa', label: 'Africa', group: 'Continents', bbox: { south: -35, west: -18, north: 38, east: 52 } },
  { id: 'middle-east', label: 'Middle East', group: 'Continents', bbox: { south: 12, west: 25, north: 42, east: 63 } },
  { id: 'asia', label: 'Asia', group: 'Continents', bbox: { south: -10, west: 60, north: 55, east: 150 } },
  { id: 'oceania', label: 'Oceania', group: 'Continents', bbox: { south: -48, west: 110, north: 0, east: 180 } },

  // Countries
  { id: 'usa', label: 'United States', group: 'Countries', bbox: { south: 24, west: -125, north: 50, east: -66 } },
  { id: 'canada', label: 'Canada', group: 'Countries', bbox: { south: 41, west: -141, north: 72, east: -52 } },
  { id: 'uk', label: 'United Kingdom', group: 'Countries', bbox: { south: 49.5, west: -8, north: 59, east: 2 } },
  { id: 'germany', label: 'Germany', group: 'Countries', bbox: { south: 47, west: 5.5, north: 55.5, east: 15.5 } },
  { id: 'france', label: 'France', group: 'Countries', bbox: { south: 42, west: -5, north: 51.5, east: 8.5 } },
  { id: 'spain', label: 'Spain', group: 'Countries', bbox: { south: 36, west: -9.5, north: 43.8, east: 4.5 } },
  { id: 'italy', label: 'Italy', group: 'Countries', bbox: { south: 36.5, west: 6.5, north: 47.5, east: 18.5 } },
  { id: 'china', label: 'China', group: 'Countries', bbox: { south: 18, west: 73, north: 54, east: 135 } },
  { id: 'japan', label: 'Japan', group: 'Countries', bbox: { south: 24, west: 123, north: 46, east: 146 } },
  { id: 'south-korea', label: 'South Korea', group: 'Countries', bbox: { south: 33, west: 124, north: 39, east: 132 } },
  { id: 'india', label: 'India', group: 'Countries', bbox: { south: 6, west: 68, north: 36, east: 98 } },
  { id: 'australia', label: 'Australia', group: 'Countries', bbox: { south: -44, west: 112, north: -10, east: 154 } },
  { id: 'brazil', label: 'Brazil', group: 'Countries', bbox: { south: -34, west: -74, north: 6, east: -34 } },
];
