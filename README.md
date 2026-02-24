# Geospatial Command Center

A browser-based geospatial command center that aggregates publicly available data streams into a unified 3D globe interface. Built with CesiumJS + Google Photorealistic 3D Tiles, React, TypeScript, and Vite.

## Features

- **3D Globe** - Google Photorealistic 3D Tiles rendered via CesiumJS
- **Live Flight Tracking** - Real-time ADS-B aircraft positions from OpenSky Network
- **Satellite Orbits** - 200+ satellites with SGP4 orbit propagation from CelesTrak TLE data
- **Earthquake Overlay** - USGS real-time earthquake data with pulsing magnitude indicators
- **Austin Traffic Cameras** - 700+ camera locations from City of Austin Open Data
- **Visual Filters** - FLIR thermal, Night Vision, and CRT post-processing effects
- **Dark Command Center UI** - Layer toggles, HUD, info panels, status bar

## Prerequisites

You need two API keys:

1. **Google Maps API Key** - Enable "Map Tiles API" in [Google Cloud Console](https://console.cloud.google.com/)
2. **Cesium Ion Token** - Get a free token at [cesium.com/ion](https://ion.cesium.com/tokens)

## Setup

```bash
# Install dependencies
npm install

# Create your environment file
cp .env.example .env.local

# Edit .env.local with your actual keys
# VITE_GOOGLE_MAPS_API_KEY=your_key_here
# VITE_CESIUM_ION_TOKEN=your_token_here

# Start development server
npm run dev
```

## Data Sources

| Layer | Source | Auth | Refresh |
|-------|--------|------|---------|
| 3D Globe | Google Map Tiles API | API Key | Per-session |
| Flights | OpenSky Network | None (anonymous) | 10s |
| Satellites | CelesTrak | None | On load |
| Earthquakes | USGS GeoJSON | None | 60s |
| Cameras | City of Austin Socrata | None | On load |

## Project Structure

```
src/
  components/Globe/       - CesiumJS viewer wrapper
  components/Sidebar/     - Layer toggle controls
  components/HUD/         - Camera position display
  components/InfoPanel/   - Entity detail panel
  components/FilterBar/   - Visual filter selector
  components/StatusBar/   - Data freshness timestamps
  layers/                 - Layer managers (flight, satellite, earthquake, camera)
  filters/                - GLSL post-processing shaders
  services/               - API client functions
  store/                  - Zustand state management
public/icons/             - SVG icons for map markers
```

## Tech Stack

- React 18 + TypeScript + Vite
- CesiumJS with Google Photorealistic 3D Tiles
- Tailwind CSS
- Zustand (state management)
- satellite.js (SGP4 orbit propagation)
