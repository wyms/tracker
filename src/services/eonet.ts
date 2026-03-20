export interface EonetEvent {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  date: string;
  source: string;
  sourceUrl: string;
}

// NASA EONET (Earth Observatory Natural Event Tracker) v3 — free, no key, CORS supported
// Covers: volcanoes, severe storms, wildfires, icebergs, earthquakes, floods, etc.
const EONET_URL =
  'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200';

export async function fetchEonetEvents(): Promise<EonetEvent[]> {
  const response = await fetch(EONET_URL);
  if (!response.ok) throw new Error(`EONET fetch failed: ${response.status}`);

  const data = await response.json();
  if (!data.events || !Array.isArray(data.events)) return [];

  const events: EonetEvent[] = [];

  for (const ev of data.events) {
    const cats = ev.categories;
    const category = cats?.[0]?.title || 'Unknown';

    // Get the most recent geometry
    const geometries = ev.geometry;
    if (!geometries || geometries.length === 0) continue;

    const latest = geometries[geometries.length - 1];
    const coords = latest.coordinates;
    if (!coords || coords.length < 2) continue;

    const source = ev.sources?.[0];

    events.push({
      id: ev.id,
      title: ev.title,
      category,
      longitude: coords[0],
      latitude: coords[1],
      date: latest.date || '',
      source: source?.id || '',
      sourceUrl: source?.url || '',
    });
  }

  return events;
}
