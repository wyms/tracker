// USGS earthquake data service

export interface EarthquakeFeature {
  type: "Feature";
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    url: string;
    detail: string;
    status: string;
    tsunami: number;
    sig: number;
    type: string;
    title: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  id: string;
}

export interface USGSResponse {
  type: "FeatureCollection";
  metadata: {
    generated: number;
    url: string;
    title: string;
    count: number;
  };
  features: EarthquakeFeature[];
}

export async function fetchEarthquakes(): Promise<EarthquakeFeature[]> {
  try {
    const url = "/api/usgs/earthquakes/feed/v1.0/summary/all_day.geojson";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `USGS API error: ${response.status} ${response.statusText}`
      );
    }

    const data: USGSResponse = await response.json();

    return data.features;
  } catch (error) {
    console.error("Failed to fetch earthquakes from USGS:", error);
    return [];
  }
}
