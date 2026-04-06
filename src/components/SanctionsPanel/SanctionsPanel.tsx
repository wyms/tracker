import { useState, useCallback } from 'react';
import { fetchSanctionsList, searchSanctions, type SanctionEntry } from '../../services/ofac';

export function SanctionsPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SanctionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [allEntries, setAllEntries] = useState<SanctionEntry[]>([]);
  const [lastSearchTime, setLastSearchTime] = useState(0);

  const handleSearch = useCallback(async () => {
    if (query.length < 2) return;
    const now = Date.now();
    if (now - lastSearchTime < 2000) return;
    setLastSearchTime(now);
    setLoading(true);

    try {
      let entries = allEntries;
      if (!listLoaded) {
        entries = await fetchSanctionsList();
        setAllEntries(entries);
        setListLoaded(true);
      }
      setResults(searchSanctions(entries, query));
    } catch (e) {
      console.error('Sanctions search failed:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, allEntries, listLoaded, lastSearchTime]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-10 right-4 z-10 text-xs font-mono px-3 py-1.5 rounded-lg border backdrop-blur-sm"
        style={{
          background: 'rgba(13,27,42,0.85)',
          borderColor: 'rgba(255,193,7,0.3)',
          color: '#FFC107',
        }}
      >
        OFAC SDN
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-10 right-4 z-10 w-80 rounded-lg border backdrop-blur-sm overflow-hidden"
      style={{
        background: 'rgba(13,27,42,0.95)',
        borderColor: 'rgba(255,193,7,0.2)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(255,193,7,0.15)' }}
      >
        <span className="text-xs font-bold tracking-widest" style={{ color: '#FFC107' }}>
          OFAC SANCTIONS
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
        >
          &times;
        </button>
      </div>
      <div className="p-3">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search SDN list..."
            className="flex-1 text-xs font-mono rounded px-2 py-1.5 outline-none"
            style={{
              background: 'rgba(255,193,7,0.08)',
              border: '1px solid rgba(255,193,7,0.3)',
              color: '#E0E0E0',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="text-xs font-mono px-3 py-1.5 rounded"
            style={{
              background: 'rgba(255,193,7,0.15)',
              border: '1px solid rgba(255,193,7,0.3)',
              color: '#FFC107',
            }}
          >
            {loading ? '...' : 'Search'}
          </button>
        </div>
        {!listLoaded && (
          <p className="text-xs text-gray-500 font-mono mb-2">
            First search downloads the OFAC SDN list (~3MB)
          </p>
        )}
        <div className="max-h-48 overflow-y-auto space-y-2">
          {results.map((r) => (
            <div
              key={r.uid}
              className="text-xs border rounded p-2"
              style={{
                borderColor: 'rgba(255,193,7,0.15)',
                background: 'rgba(255,193,7,0.05)',
              }}
            >
              <div className="font-bold text-white">{r.name}</div>
              <div className="text-gray-400 font-mono">
                {r.type} | {r.programs}
              </div>
              {r.remarks && (
                <div className="text-gray-500 mt-1 line-clamp-2">{r.remarks}</div>
              )}
            </div>
          ))}
          {results.length === 0 && listLoaded && query.length >= 2 && !loading && (
            <p className="text-xs text-gray-500 font-mono">No matches found</p>
          )}
        </div>
      </div>
    </div>
  );
}
