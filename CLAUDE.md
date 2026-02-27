# Geospatial Command Center

## Tech Stack
- React 19 + TypeScript
- Vite 7
- CesiumJS for 3D globe rendering
- Zustand for state management
- Tailwind CSS 4
- OpenSky Network API for flight data

## Project Structure
- `src/components/` - React components (Globe, SearchPanel, etc.)
- `src/layers/` - CesiumJS visualization layers (FlightLayer, HistoricalTrackLayer)
- `src/services/` - API service modules (opensky.ts)
- `src/store/` - Zustand state management

## Code Style
- TypeScript strict mode
- Functional React components with hooks
- Tailwind for styling (no CSS modules)
- ESLint for linting

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Type-check and build for production
- `npm run lint` - Run ESLint
