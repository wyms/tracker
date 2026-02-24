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

export async function fetchFlights(
  bbox?: BoundingBox
): Promise<AircraftState[]> {
  try {
    const params = new URLSearchParams();

    if (bbox) {
      params.set("lamin", bbox.south.toString());
      params.set("lomin", bbox.west.toString());
      params.set("lamax", bbox.north.toString());
      params.set("lomax", bbox.east.toString());
    }

    const query = params.toString();
    const url = `/api/opensky/states/all${query ? `?${query}` : ""}`;

    const response = await fetch(url);

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
  } catch (error) {
    console.error("Failed to fetch flights from OpenSky:", error);
    return [];
  }
}
