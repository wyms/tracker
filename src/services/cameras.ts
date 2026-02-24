// Austin traffic cameras service

export interface AustinCamera {
  camera_id: string;
  location_name: string;
  camera_status: string;
  camera_mfg: string;
  comm_status: string;
  location: {
    latitude: string;
    longitude: string;
    human_address?: string;
  };
  turn_on_date?: string;
  atd_location_id?: string;
}

function hasValidLocation(camera: AustinCamera): boolean {
  if (!camera.location) {
    return false;
  }

  const lat = parseFloat(camera.location.latitude);
  const lon = parseFloat(camera.location.longitude);

  return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
}

export async function fetchCameras(): Promise<AustinCamera[]> {
  try {
    const url = "/api/austin/resource/b4k4-adkb.json?$limit=1000";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Austin cameras API error: ${response.status} ${response.statusText}`
      );
    }

    const data: AustinCamera[] = await response.json();

    return data.filter(hasValidLocation);
  } catch (error) {
    console.error("Failed to fetch cameras from Austin data portal:", error);
    return [];
  }
}
