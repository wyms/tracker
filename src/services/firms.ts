export interface FireHotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  frp: number;
  confidence: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
  daynight: string;
}

// NASA FIRMS open data — VIIRS (Suomi NPP) active fire detections, last 24 hours
// Proxied through Firebase function to avoid CORS issues
const FIRMS_PATH = '/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';
const FIRMS_URL = `/api/firms${FIRMS_PATH}`;

export async function fetchFireHotspots(): Promise<FireHotspot[]> {
  const response = await fetch(FIRMS_URL);
  if (!response.ok) throw new Error(`FIRMS fetch failed: ${response.status}`);

  const text = await response.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('bright_ti4');
  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const satIdx = headers.indexOf('satellite');
  const dnIdx = headers.indexOf('daynight');

  const hotspots: FireHotspot[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < headers.length) continue;

    const confidence = cols[confIdx]?.trim().toLowerCase();

    // Filter out low-confidence detections
    if (confidence === 'low' || confidence === 'l') continue;

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    hotspots.push({
      latitude: lat,
      longitude: lon,
      brightness: parseFloat(cols[brightIdx]) || 0,
      frp: parseFloat(cols[frpIdx]) || 0,
      confidence: cols[confIdx]?.trim() || 'nominal',
      acq_date: cols[dateIdx]?.trim() || '',
      acq_time: cols[timeIdx]?.trim() || '',
      satellite: cols[satIdx]?.trim() || '',
      daynight: cols[dnIdx]?.trim() || '',
    });
  }

  return hotspots;
}
