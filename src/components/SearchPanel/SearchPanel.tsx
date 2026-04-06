import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  searchLiveByCallsign,
  resolveCallsignToIcao24,
  fetchHistoricalFlightsFullRange,
  fetchFlightTrack,
} from '../../services/opensky';
import type { AircraftState, HistoricalFlight } from '../../services/opensky';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Spinner() {
  return (
    <div
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      style={{ borderColor: '#00E5FF', borderTopColor: 'transparent' }}
    />
  );
}

export function SearchPanel() {
  const {
    searchQuery,
    setSearchQuery,
    searchStatus,
    setSearchStatus,
    searchError,
    setSearchError,
    searchResults,
    setSearchResults,
    setSelectedSearchResult,
    historicalFlights,
    setHistoricalFlights,
    setActiveTrack,
    setActiveHistoricalFlight,
    searchDateRange,
    setSearchDateRange,
    setFlyToTarget,
    setSelectedEntity,
    resolvedIcao24,
    setResolvedIcao24,
    clearSearch,
  } = useAppStore();

  const [showDates, setShowDates] = useState(false);

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;

    setSearchStatus('searching');
    setSearchError(null);
    setSearchResults([]);
    setHistoricalFlights([]);
    setActiveTrack(null);
    setActiveHistoricalFlight(null);
    setSelectedSearchResult(null);
    setResolvedIcao24(null);

    const begin = Math.floor(searchDateRange.begin.getTime() / 1000);
    const end = Math.floor(searchDateRange.end.getTime() / 1000);

    try {
      // 1. Try live search first
      const results = await searchLiveByCallsign(q);

      if (results.length > 0) {
        setSearchResults(results);
        setSearchStatus('idle');
        return;
      }

      // 2. Not airborne — resolve callsign from flight records
      setSearchStatus('resolving');
      const resolved = await resolveCallsignToIcao24(q, begin, end);

      if (!resolved) {
        setSearchStatus('idle');
        setSearchError(
          'No aircraft found matching that callsign (live or in flight records within date range).'
        );
        return;
      }

      // 3. Found icao24 — load full history
      setResolvedIcao24(resolved.icao24);
      setSearchStatus('loading_history');

      const flights = await fetchHistoricalFlightsFullRange(
        resolved.icao24,
        begin,
        end
      );
      setHistoricalFlights(flights);
      setSearchStatus('idle');

      if (flights.length === 0) {
        setSearchError(
          `Found aircraft (${resolved.icao24}) but no flights in selected date range.`
        );
      }
    } catch (err) {
      setSearchStatus('error');
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    }
  }

  async function handleSelectResult(ac: AircraftState) {
    setSelectedSearchResult(ac);

    // Fly camera to aircraft
    if (ac.longitude != null && ac.latitude != null) {
      setFlyToTarget({
        lon: ac.longitude,
        lat: ac.latitude,
        alt: ac.baro_altitude ?? 10000,
      });
    }

    // Set selected entity for InfoPanel
    setSelectedEntity({
      type: 'aircraft',
      id: ac.icao24,
      data: {
        icao24: ac.icao24,
        callsign: ac.callsign?.trim() || ac.icao24,
        altitude: ac.baro_altitude,
        velocity: ac.velocity,
        origin_country: ac.origin_country,
        true_track: ac.true_track,
        vertical_rate: ac.vertical_rate,
        on_ground: ac.on_ground,
      },
    });

    // Auto-load historical flights
    setSearchStatus('loading_history');
    setHistoricalFlights([]);
    setResolvedIcao24(ac.icao24);
    try {
      const begin = Math.floor(searchDateRange.begin.getTime() / 1000);
      const end = Math.floor(searchDateRange.end.getTime() / 1000);
      const flights = await fetchHistoricalFlightsFullRange(
        ac.icao24,
        begin,
        end
      );
      setHistoricalFlights(flights);
      setSearchStatus('idle');
    } catch (err) {
      setSearchStatus('error');
      setSearchError(
        err instanceof Error ? err.message : 'Failed to load history'
      );
    }
  }

  async function handleShowTrack(flight: HistoricalFlight) {
    setSearchStatus('loading_track');
    setSearchError(null);
    try {
      const track = await fetchFlightTrack(flight.icao24, flight.firstSeen);
      setActiveHistoricalFlight(flight);
      setActiveTrack(track);
      setSearchStatus('idle');
    } catch (err) {
      setSearchStatus('error');
      setSearchError(
        err instanceof Error ? err.message : 'Failed to load track'
      );
    }
  }

  const isLoading =
    searchStatus === 'searching' ||
    searchStatus === 'resolving' ||
    searchStatus === 'loading_history' ||
    searchStatus === 'loading_track';

  const statusLabel: Record<string, string> = {
    searching: 'Searching live...',
    resolving: 'Searching flight records...',
    loading_history: 'Loading history...',
    loading_track: 'Loading track...',
  };

  return (
    <div className="absolute top-[520px] left-4 z-30 w-56 hidden md:block">
      <div
        className="rounded-lg border backdrop-blur-sm overflow-hidden"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <h2
            className="text-xs font-bold tracking-widest mb-3 uppercase"
            style={{ color: '#00E5FF' }}
          >
            Flight Search
          </h2>

          {/* Search input */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Callsign..."
              className="flex-1 px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                background: 'rgba(0,229,255,0.08)',
                border: '1px solid rgba(0,229,255,0.2)',
                color: '#E0E0E0',
              }}
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-2 py-1.5 rounded text-xs font-bold tracking-wide"
              style={{
                background: 'rgba(0,229,255,0.15)',
                border: '1px solid rgba(0,229,255,0.3)',
                color: '#00E5FF',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? <Spinner /> : 'GO'}
            </button>
          </div>

          {/* Date range toggle */}
          <button
            onClick={() => setShowDates(!showDates)}
            className="mt-2 text-xs w-full text-left"
            style={{ color: '#4A90A4' }}
          >
            {showDates ? '- Date range' : '+ Date range'}
          </button>

          {showDates && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: '#4A5568' }}
                >
                  From
                </span>
                <input
                  type="date"
                  value={formatDate(searchDateRange.begin)}
                  onChange={(e) =>
                    setSearchDateRange({
                      ...searchDateRange,
                      begin: new Date(e.target.value),
                    })
                  }
                  className="flex-1 px-1.5 py-1 rounded text-xs font-mono"
                  style={{
                    background: 'rgba(0,229,255,0.08)',
                    border: '1px solid rgba(0,229,255,0.15)',
                    color: '#E0E0E0',
                    colorScheme: 'dark',
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono"
                  style={{ color: '#4A5568', paddingRight: '6px' }}
                >
                  To
                </span>
                <input
                  type="date"
                  value={formatDate(searchDateRange.end)}
                  onChange={(e) =>
                    setSearchDateRange({
                      ...searchDateRange,
                      end: new Date(e.target.value),
                    })
                  }
                  className="flex-1 px-1.5 py-1 rounded text-xs font-mono"
                  style={{
                    background: 'rgba(0,229,255,0.08)',
                    border: '1px solid rgba(0,229,255,0.15)',
                    color: '#E0E0E0',
                    colorScheme: 'dark',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div
            className="flex items-center gap-2 px-4 py-2 text-xs"
            style={{ color: '#00E5FF' }}
          >
            <Spinner />
            <span>{statusLabel[searchStatus] || 'Loading...'}</span>
          </div>
        )}

        {/* Error */}
        {searchError && !isLoading && (
          <div className="px-4 py-2 text-xs" style={{ color: '#FF6B6B' }}>
            {searchError}
          </div>
        )}

        {/* Resolved icao24 info (when aircraft found offline) */}
        {resolvedIcao24 && searchResults.length === 0 && !isLoading && (
          <div
            className="px-4 py-2 text-xs"
            style={{
              color: '#4A90A4',
              borderTop: '1px solid rgba(0,229,255,0.1)',
            }}
          >
            Not currently airborne. Resolved ICAO24:{' '}
            <span className="font-mono font-bold" style={{ color: '#00E5FF' }}>
              {resolvedIcao24}
            </span>
          </div>
        )}

        {/* Live results */}
        {searchResults.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}>
            <div
              className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: '#4A90A4' }}
            >
              Live Results ({searchResults.length})
            </div>
            <div className="max-h-32 overflow-y-auto">
              {searchResults.map((ac) => (
                <button
                  key={ac.icao24}
                  onClick={() => handleSelectResult(ac)}
                  className="w-full px-4 py-1.5 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: '#00E5FF' }}
                    >
                      {ac.callsign?.trim() || ac.icao24}
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: '#4A5568' }}
                    >
                      {ac.icao24}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: '#5A6A7A' }}>
                    {ac.origin_country}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Historical flights */}
        {historicalFlights.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}>
            <div
              className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: '#4A90A4' }}
            >
              History ({historicalFlights.length})
            </div>
            <div className="max-h-40 overflow-y-auto">
              {historicalFlights.map((flight, i) => (
                <div
                  key={`${flight.icao24}-${flight.firstSeen}-${i}`}
                  className="px-4 py-1.5 hover:bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-mono"
                      style={{ color: '#E0E0E0' }}
                    >
                      {flight.estDepartureAirport || '????'} →{' '}
                      {flight.estArrivalAirport || '????'}
                    </span>
                    <button
                      onClick={() => handleShowTrack(flight)}
                      disabled={isLoading}
                      className="text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{
                        background: 'rgba(0,229,255,0.1)',
                        border: '1px solid rgba(0,229,255,0.25)',
                        color: '#00E5FF',
                        opacity: isLoading ? 0.5 : 1,
                      }}
                    >
                      Track
                    </button>
                  </div>
                  <div
                    className="text-xs font-mono"
                    style={{ color: '#4A5568' }}
                  >
                    {new Date(flight.firstSeen * 1000).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clear button */}
        {(searchResults.length > 0 ||
          historicalFlights.length > 0 ||
          resolvedIcao24 ||
          searchError) && (
          <div
            className="px-4 py-2"
            style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}
          >
            <button
              onClick={() => {
                clearSearch();
                setActiveTrack(null);
                setActiveHistoricalFlight(null);
              }}
              className="w-full py-1.5 rounded text-xs font-bold tracking-wide"
              style={{
                background: 'rgba(255,100,100,0.1)',
                border: '1px solid rgba(255,100,100,0.25)',
                color: '#FF6B6B',
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
