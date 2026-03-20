export interface RadiationReading {
  id: number;
  latitude: number;
  longitude: number;
  value: number;
  unit: string;
  captured_at: string;
  device_id: number | null;
}

// Safecast API — open radiation monitoring data, no key required
// Returns recent measurements; we request a broad geographic sample
const SAFECAST_URL =
  'https://api.safecast.org/measurements.json?order=captured_at+desc&per_page=2000';

export async function fetchRadiationReadings(): Promise<RadiationReading[]> {
  const response = await fetch(SAFECAST_URL);
  if (!response.ok) throw new Error(`Safecast fetch failed: ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  const readings: RadiationReading[] = [];

  for (const item of data) {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;
    if (lat === 0 && lon === 0) continue; // skip null-island entries

    readings.push({
      id: item.id || 0,
      latitude: lat,
      longitude: lon,
      value: parseFloat(item.value) || 0,
      unit: item.unit || 'cpm',
      captured_at: item.captured_at || '',
      device_id: item.device_id || null,
    });
  }

  return readings;
}
