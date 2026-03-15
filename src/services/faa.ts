// Major US airport coordinates for mapping FAA status data
const AIRPORT_COORDS: Record<string, [number, number]> = {
  // Top 50 US airports by traffic + common delay airports
  ATL: [33.6407, -84.4277], LAX: [33.9425, -118.4081], ORD: [41.9742, -87.9073],
  DFW: [32.8998, -97.0403], DEN: [39.8561, -104.6737], JFK: [40.6413, -73.7781],
  SFO: [37.6213, -122.379], SEA: [47.4502, -122.3088], LAS: [36.0840, -115.1537],
  MCO: [28.4312, -81.3081], EWR: [40.6895, -74.1745], CLT: [35.2140, -80.9431],
  PHX: [33.4373, -112.0078], IAH: [29.9902, -95.3368], MIA: [25.7959, -80.2870],
  BOS: [42.3656, -71.0096], MSP: [44.8848, -93.2223], FLL: [26.0742, -80.1506],
  DTW: [42.2124, -83.3534], PHL: [39.8744, -75.2424], LGA: [40.7769, -73.8740],
  BWI: [39.1774, -76.6684], SLC: [40.7899, -111.9791], IAD: [38.9531, -77.4565],
  DCA: [38.8512, -77.0402], SAN: [32.7338, -117.1933], MDW: [41.7868, -87.7522],
  TPA: [27.9756, -82.5333], PDX: [45.5898, -122.5951], HNL: [21.3187, -157.9225],
  AUS: [30.1975, -97.6664], STL: [38.7487, -90.3700], BNA: [36.1263, -86.6774],
  MSY: [29.9934, -90.2580], RDU: [35.8801, -78.7880], SJC: [37.3639, -121.9289],
  DAL: [32.8471, -96.8518], HOU: [29.6454, -95.2789], SMF: [38.6951, -121.5908],
  IND: [39.7173, -86.2944], PIT: [40.4957, -80.2328], CLE: [41.4058, -81.8539],
  CMH: [39.9980, -82.8919], MCI: [39.2976, -94.7139], SAT: [29.5337, -98.4698],
  OAK: [37.7213, -122.2208], RSW: [26.5362, -81.7553], CVG: [39.0488, -84.6678],
  MKE: [42.9472, -87.8966], ABQ: [35.0402, -106.6092],
  // Common smaller airports that get ground stops
  TEB: [40.8501, -74.0608], HDN: [40.4813, -106.8662], MTJ: [38.5098, -107.8942],
  ASE: [39.2232, -106.8689], EGE: [39.6426, -106.9159], GJT: [39.1224, -108.5267],
  // US territories and other airports that appear in FAA closures
  STX: [17.7019, -64.7986], STT: [18.3373, -64.9734], SJU: [18.4394, -66.0018],
  PSP: [33.8297, -116.5067], ONT: [34.0560, -117.6012], BUR: [34.1975, -118.3585],
};

export interface FAAProgram {
  airport: string;
  type: 'ground_stop' | 'ground_delay' | 'closure' | 'delay';
  reason: string;
  detail: string;
  lat: number;
  lon: number;
}

export async function fetchFAAStatus(): Promise<FAAProgram[]> {
  const res = await fetch('/api/faa/api/airport-status-information');
  if (!res.ok) throw new Error(`FAA API ${res.status}`);

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const programs: FAAProgram[] = [];

  // Ground Stops
  for (const el of doc.querySelectorAll('Ground_Stop')) {
    const airport = el.querySelector('ARPT')?.textContent?.trim();
    const reason = el.querySelector('Reason')?.textContent?.trim() || 'Unknown';
    const endTime = el.querySelector('End_Time')?.textContent?.trim() || '';
    if (!airport) continue;
    const coords = AIRPORT_COORDS[airport];
    if (!coords) continue;
    programs.push({
      airport,
      type: 'ground_stop',
      reason,
      detail: endTime ? `Until ${endTime}` : '',
      lat: coords[0],
      lon: coords[1],
    });
  }

  // Ground Delay Programs
  for (const el of doc.querySelectorAll('Ground_Delay')) {
    const airport = el.querySelector('ARPT')?.textContent?.trim();
    const reason = el.querySelector('Reason')?.textContent?.trim() || 'Unknown';
    const avg = el.querySelector('Avg')?.textContent?.trim() || '';
    const max = el.querySelector('Max')?.textContent?.trim() || '';
    if (!airport) continue;
    const coords = AIRPORT_COORDS[airport];
    if (!coords) continue;
    programs.push({
      airport,
      type: 'ground_delay',
      reason,
      detail: max ? `Avg: ${avg}, Max: ${max}` : avg,
      lat: coords[0],
      lon: coords[1],
    });
  }

  // Airport Closures (tag is <Airport> inside <Airport_Closure_List>)
  for (const el of doc.querySelectorAll('Airport_Closure_List > Airport, Airport_Closure')) {
    const airport = el.querySelector('ARPT')?.textContent?.trim();
    const reason = el.querySelector('Reason')?.textContent?.trim() || 'Closed';
    const reopen = el.querySelector('Reopen')?.textContent?.trim() || '';
    if (!airport) continue;
    const coords = AIRPORT_COORDS[airport];
    if (!coords) continue;
    programs.push({
      airport,
      type: 'closure',
      reason,
      detail: reopen ? `Reopens: ${reopen}` : '',
      lat: coords[0],
      lon: coords[1],
    });
  }

  // Arrival/Departure Delays
  for (const el of doc.querySelectorAll('Delay')) {
    const airport = el.querySelector('ARPT')?.textContent?.trim();
    const reason = el.querySelector('Reason')?.textContent?.trim() || 'Unknown';
    const arrDep = el.querySelector('Arrival_Departure');
    const delayType = arrDep?.getAttribute('Type') || '';
    const minDelay = arrDep?.querySelector('Min')?.textContent?.trim() || el.querySelector('Min')?.textContent?.trim() || '';
    const maxDelay = arrDep?.querySelector('Max')?.textContent?.trim() || el.querySelector('Max')?.textContent?.trim() || '';
    if (!airport) continue;
    const coords = AIRPORT_COORDS[airport];
    if (!coords) continue;
    programs.push({
      airport,
      type: 'delay',
      reason,
      detail: delayType ? `${delayType}: ${minDelay}–${maxDelay}` : `${minDelay}–${maxDelay}`,
      lat: coords[0],
      lon: coords[1],
    });
  }

  return programs;
}
