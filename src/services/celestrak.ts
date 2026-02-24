// CelesTrak satellite TLE data service

export interface SatelliteGP {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  NORAD_CAT_ID: number;
  OBJECT_TYPE: string;
  CLASSIFICATION_TYPE: string;
  TLE_LINE1: string;
  TLE_LINE2: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export async function fetchStations(): Promise<SatelliteGP[]> {
  try {
    const url =
      "/api/celestrak/NORAD/elements/gp.php?GROUP=stations&FORMAT=json";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `CelesTrak API error: ${response.status} ${response.statusText}`
      );
    }

    const data: SatelliteGP[] = await response.json();

    return data;
  } catch (error) {
    console.error("Failed to fetch space stations from CelesTrak:", error);
    return [];
  }
}

export async function fetchActiveSatellites(): Promise<SatelliteGP[]> {
  try {
    const url =
      "/api/celestrak/NORAD/elements/gp.php?GROUP=active&FORMAT=json";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `CelesTrak API error: ${response.status} ${response.statusText}`
      );
    }

    const data: SatelliteGP[] = await response.json();

    return data.slice(0, 200);
  } catch (error) {
    console.error(
      "Failed to fetch active satellites from CelesTrak:",
      error
    );
    return [];
  }
}
