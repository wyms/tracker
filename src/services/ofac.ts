export interface SanctionEntry {
  uid: string;
  name: string;
  type: string;
  programs: string;
  remarks: string;
}

// OFAC SDN (Specially Designated Nationals) list — US Treasury, fully public
// The full CSV is large (~30MB), so we use the smaller consolidated XML-derived list
const OFAC_URL =
  'https://www.treasury.gov/ofac/downloads/sdn.csv';

let cachedEntries: SanctionEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchSanctionsList(): Promise<SanctionEntry[]> {
  // Use cache since list updates infrequently
  if (cachedEntries && Date.now() - cacheTime < CACHE_TTL) {
    return cachedEntries;
  }

  const response = await fetch(OFAC_URL);
  if (!response.ok) throw new Error(`OFAC fetch failed: ${response.status}`);

  const text = await response.text();
  const lines = text.trim().split('\n');

  const entries: SanctionEntry[] = [];

  for (const line of lines) {
    // CSV format: UID, Name, Type, Programs, Title, Vessel info, Remarks, etc.
    // Simple CSV parse (OFAC uses quoted fields)
    const cols = parseCSVLine(line);
    if (cols.length < 4) continue;

    entries.push({
      uid: cols[0]?.trim() || '',
      name: cols[1]?.trim() || '',
      type: cols[2]?.trim() || '',
      programs: cols[3]?.trim() || '',
      remarks: cols[11]?.trim() || '',
    });
  }

  cachedEntries = entries;
  cacheTime = Date.now();
  return entries;
}

export function searchSanctions(entries: SanctionEntry[], query: string): SanctionEntry[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return entries
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.uid.toLowerCase().includes(q) ||
        e.programs.toLowerCase().includes(q)
    )
    .slice(0, 50);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
