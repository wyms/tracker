export interface GdeltEvent {
  url: string;
  name: string;
  latitude: number;
  longitude: number;
  html: string;
  tonez: number;
  shareimage: string;
  domain: string;
}

// GDELT GEO 2.0 API — geolocated news events, free, no key, CORS supported
const GDELT_GEO_URL =
  'https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20attack%20OR%20military%20OR%20protest%20OR%20explosion&format=GeoJSON&timespan=24h&maxpoints=500';

const GDELT_NEWS_URL =
  'https://api.gdeltproject.org/api/v2/geo/geo?query=&format=GeoJSON&timespan=24h&maxpoints=250';

export async function fetchGdeltEvents(mode: 'conflict' | 'news' = 'conflict'): Promise<GdeltEvent[]> {
  const url = mode === 'conflict' ? GDELT_GEO_URL : GDELT_NEWS_URL;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GDELT fetch failed: ${response.status}`);

  const geojson = await response.json();

  if (!geojson.features || !Array.isArray(geojson.features)) return [];

  const events: GdeltEvent[] = [];

  for (const feature of geojson.features) {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || coords.length < 2 || !props) continue;

    events.push({
      url: props.url || '',
      name: props.name || props.urlpubtimeseq || 'Unknown',
      latitude: coords[1],
      longitude: coords[0],
      html: props.html || '',
      tonez: parseFloat(props.tonez) || 0,
      shareimage: props.shareimage || '',
      domain: props.domain || '',
    });
  }

  return events;
}
