// OpenSky Network ADS-B flight tracking service

export interface AircraftState {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  time_position: number | null;
  last_contact: number;
  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;
  sensors: number[] | null;
  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
}

export interface HistoricalFlight {
  icao24: string;
  firstSeen: number;
  estDepartureAirport: string | null;
  lastSeen: number;
  estArrivalAirport: string | null;
  callsign: string | null;
  estDepartureAirportHorizDistance: number;
  estDepartureAirportVertDistance: number;
  estArrivalAirportHorizDistance: number;
  estArrivalAirportVertDistance: number;
  departureAirportCandidatesCount: number;
  arrivalAirportCandidatesCount: number;
}

export interface TrackWaypoint {
  time: number;
  latitude: number | null;
  longitude: number | null;
  baro_altitude: number | null;
  true_track: number | null;
  on_ground: boolean;
}

export interface FlightTrack {
  icao24: string;
  callsign: string | null;
  startTime: number;
  endTime: number;
  path: TrackWaypoint[];
}

export interface OpenSkyResponse {
  time: number;
  states: (string | number | boolean | number[] | null)[][] | null;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const OPENSKY_DIRECT = "https://opensky-network.org";

// --- Client-side OAuth2 token cache ---
// Used when the Cloud Function proxy is unreachable (GCP connectivity issues).
// Credentials are already in VITE_ env vars (bundled into the client).

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOpenSkyToken(): Promise<string | null> {
  const clientId = import.meta.env.VITE_OPENSKY_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

/**
 * Fetch with triple-fallback strategy:
 * 1. Cloud Function proxy (fastest when working, 4s timeout)
 * 2. CORS proxy via allorigins.win (reliable fallback when GCP is blocked)
 * 3. Direct OpenSky call with auth (works in dev, CORS-blocked in prod)
 */
async function fetchWithFallback(proxyUrl: string, directUrl: string): Promise<Response> {
  // 1. Cloud Function proxy — fast but GCP IPs may be blocked
  const proxyController = new AbortController();
  const proxyTimeout = setTimeout(() => proxyController.abort(), 4_000);

  const proxyPromise = fetch(proxyUrl, { signal: proxyController.signal })
    .then((res) => {
      clearTimeout(proxyTimeout);
      if (!res.ok) throw new Error(`Proxy ${res.status}`);
      return res;
    })
    .catch((err) => {
      clearTimeout(proxyTimeout);
      throw err;
    });

  // 2. CORS proxy fallback — uses allorigins.win to bypass CORS + GCP blocks
  const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
  const corsProxyPromise = fetch(corsProxyUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`CORSProxy ${res.status}`);
      return res;
    });

  // 3. Direct call with auth (works in dev via Vite proxy, CORS-blocked in prod)
  const directPromise = (async () => {
    const token = await getOpenSkyToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(directUrl, { headers });
    if (!res.ok) throw new Error(`Direct ${res.status}`);
    return res;
  })();

  try {
    return await Promise.any([proxyPromise, corsProxyPromise, directPromise]);
  } catch {
    // All three failed — try CORS proxy one more time as final attempt
    return corsProxyPromise;
  }
}

function parseStateVector(
  sv: (string | number | boolean | number[] | null)[]
): AircraftState {
  return {
    icao24: sv[0] as string,
    callsign: sv[1] != null ? (sv[1] as string).trim() : null,
    origin_country: sv[2] as string,
    time_position: sv[3] as number | null,
    last_contact: sv[4] as number,
    longitude: sv[5] as number | null,
    latitude: sv[6] as number | null,
    baro_altitude: sv[7] as number | null,
    on_ground: sv[8] as boolean,
    velocity: sv[9] as number | null,
    true_track: sv[10] as number | null,
    vertical_rate: sv[11] as number | null,
    sensors: sv[12] as number[] | null,
    geo_altitude: sv[13] as number | null,
    squawk: sv[14] as string | null,
    spi: sv[15] as boolean,
    position_source: sv[16] as number,
  };
}

/**
 * Parse adsb.fi aircraft object into our AircraftState format.
 */
function parseAdsbFiAircraft(ac: Record<string, unknown>): AircraftState {
  return {
    icao24: (ac.hex as string) || "",
    callsign: ac.flight != null ? (ac.flight as string).trim() : null,
    origin_country: (ac.r as string) || "",
    time_position: ac.seen_pos != null ? Math.floor(Date.now() / 1000) - (ac.seen_pos as number) : null,
    last_contact: Math.floor(Date.now() / 1000) - ((ac.seen as number) || 0),
    longitude: (ac.lon as number) ?? null,
    latitude: (ac.lat as number) ?? null,
    baro_altitude: ac.alt_baro === "ground" ? 0 : (ac.alt_baro as number ?? null),
    on_ground: ac.alt_baro === "ground",
    velocity: (ac.gs as number) ?? null,
    true_track: (ac.track as number) ?? null,
    vertical_rate: ac.baro_rate != null ? (ac.baro_rate as number) * 0.00508 : null, // fpm to m/s
    sensors: null,
    geo_altitude: (ac.alt_geom as number) ?? null,
    squawk: (ac.squawk as string) ?? null,
    spi: false,
    position_source: 0,
  };
}

/**
 * Fetch flights using adsb.fi (primary) with OpenSky fallback.
 * adsb.fi is free, no auth, and reachable from GCP.
 */
export async function fetchFlights(
  bbox?: BoundingBox
): Promise<AircraftState[]> {
  // Try adsb.fi first (via Cloud Function proxy for CORS)
  try {
    if (bbox) {
      const centerLat = (bbox.south + bbox.north) / 2;
      const centerLon = (bbox.west + bbox.east) / 2;
      // Approximate distance in nautical miles from bbox span
      const latSpan = bbox.north - bbox.south;
      const lonSpan = bbox.east - bbox.west;
      const dist = Math.min(250, Math.max(latSpan, lonSpan) * 30);
      const res = await fetch(`/api/adsb/api/v2/lat/${centerLat.toFixed(2)}/lon/${centerLon.toFixed(2)}/dist/${Math.round(dist)}`);
      if (res.ok) {
        const data = await res.json();
        const aircraft = (data.aircraft || []) as Record<string, unknown>[];
        return aircraft
          .filter((ac) => ac.lat != null && ac.lon != null)
          .map(parseAdsbFiAircraft);
      }
    }
  } catch {
    // adsb.fi failed, fall through to OpenSky
  }

  // Fallback to OpenSky
  const params = new URLSearchParams();

  if (bbox) {
    params.set("lamin", bbox.south.toString());
    params.set("lomin", bbox.west.toString());
    params.set("lamax", bbox.north.toString());
    params.set("lomax", bbox.east.toString());
  }

  const query = params.toString();
  const suffix = `/states/all${query ? `?${query}` : ""}`;

  const response = await fetchWithFallback(
    `/api/opensky${suffix}`,
    `${OPENSKY_DIRECT}/api${suffix}`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenSky API error: ${response.status} ${response.statusText}`
    );
  }

  const data: OpenSkyResponse = await response.json();

  if (!data.states) {
    return [];
  }

  return data.states.map(parseStateVector);
}

export async function searchLiveByCallsign(
  callsign: string
): Promise<AircraftState[]> {
  const response = await fetchWithFallback(
    `/api/opensky/states/all`,
    `${OPENSKY_DIRECT}/api/states/all`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenSky API error: ${response.status} ${response.statusText}`
    );
  }

  const data: OpenSkyResponse = await response.json();
  if (!data.states) return [];

  const needle = callsign.toUpperCase();
  return data.states
    .map(parseStateVector)
    .filter(
      (ac) =>
        ac.callsign != null &&
        ac.callsign.toUpperCase().includes(needle) &&
        ac.latitude != null &&
        ac.longitude != null
    );
}

export async function fetchHistoricalFlights(
  icao24: string,
  begin: number,
  end: number
): Promise<HistoricalFlight[]> {
  const params = new URLSearchParams({
    icao24,
    begin: begin.toString(),
    end: end.toString(),
  });
  const suffix = `/flights/aircraft?${params}`;
  const response = await fetchWithFallback(
    `/api/opensky${suffix}`,
    `${OPENSKY_DIRECT}/api${suffix}`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenSky historical flights error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export async function fetchAllFlights(
  begin: number,
  end: number
): Promise<HistoricalFlight[]> {
  const params = new URLSearchParams({
    begin: begin.toString(),
    end: end.toString(),
  });
  const suffix = `/flights/all?${params}`;
  const response = await fetchWithFallback(
    `/api/opensky${suffix}`,
    `${OPENSKY_DIRECT}/api${suffix}`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenSky flights/all error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Resolve a callsign to an icao24 hex code by searching recent flight records.
 * The /flights/all endpoint only allows 2-hour windows, so we sample several
 * windows going backwards from the end of the date range.
 * Data lags ~1 day behind (batch processed nightly).
 */
export async function resolveCallsignToIcao24(
  callsign: string,
  rangeBegin: number,
  rangeEnd: number
): Promise<{ icao24: string; callsign: string } | null> {
  const needle = callsign.toUpperCase().trim();
  const TWO_HOURS = 7200;
  const ONE_DAY = 86400;

  // Data lags ~1 day; cap search at (now - 1 day) or rangeEnd, whichever is earlier
  const now = Math.floor(Date.now() / 1000);
  const safeEnd = Math.min(rangeEnd, now - ONE_DAY);
  if (safeEnd - TWO_HOURS < rangeBegin) return null;

  // Sample up to 7 non-overlapping 2-hour windows, spaced ~1 day apart, working backwards
  const windowStarts: number[] = [];
  for (
    let t = safeEnd - TWO_HOURS;
    t >= rangeBegin && windowStarts.length < 7;
    t -= ONE_DAY
  ) {
    windowStarts.push(t);
  }

  for (const wStart of windowStarts) {
    try {
      const flights = await fetchAllFlights(wStart, wStart + TWO_HOURS);
      const match = flights.find(
        (f) =>
          f.callsign != null &&
          f.callsign.toUpperCase().trim().includes(needle)
      );
      if (match) {
        return {
          icao24: match.icao24,
          callsign: match.callsign?.trim() || callsign,
        };
      }
    } catch {
      continue; // Rate limited or error — try next window
    }
  }

  return null;
}

/**
 * Fetch historical flights for an aircraft, automatically splitting requests
 * to respect the 30-day maximum range per API call.
 */
export async function fetchHistoricalFlightsFullRange(
  icao24: string,
  begin: number,
  end: number
): Promise<HistoricalFlight[]> {
  const MAX_RANGE = 86400; // 1 day — OpenSky limits queries to ~2 calendar day partitions
  const results: HistoricalFlight[] = [];
  let lastError: Error | null = null;

  let cursor = begin;
  while (cursor < end) {
    const chunkEnd = Math.min(cursor + MAX_RANGE, end);
    try {
      const flights = await fetchHistoricalFlights(icao24, cursor, chunkEnd);
      results.push(...flights);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(`Historical flights chunk failed (${icao24}, ${cursor}-${chunkEnd}):`, e);
    }
    cursor = chunkEnd;
  }

  // If all chunks failed and we have no results, throw so the UI can show the error
  if (results.length === 0 && lastError) {
    throw lastError;
  }

  return results;
}

export async function fetchFlightTrack(
  icao24: string,
  time: number
): Promise<FlightTrack> {
  const params = new URLSearchParams({
    icao24,
    time: time.toString(),
  });
  const suffix = `/tracks/all?${params}`;
  const response = await fetchWithFallback(
    `/api/opensky${suffix}`,
    `${OPENSKY_DIRECT}/api${suffix}`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenSky track error: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.json();
  return {
    icao24: raw.icao24,
    callsign: raw.callsign?.trim() || null,
    startTime: raw.startTime,
    endTime: raw.endTime,
    path: (raw.path as unknown[][]).map((wp) => ({
      time: wp[0] as number,
      latitude: wp[1] as number | null,
      longitude: wp[2] as number | null,
      baro_altitude: wp[3] as number | null,
      true_track: wp[4] as number | null,
      on_ground: wp[5] as boolean,
    })),
  };
}
