import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

export function BookmarkPanel() {
  const { bookmarks, addBookmark, removeBookmark, setFlyToTarget } = useAppStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addBookmark(trimmed);
    setName('');
  };

  const handleFlyTo = (bm: (typeof bookmarks)[0]) => {
    setFlyToTarget({
      lon: bm.position.longitude,
      lat: bm.position.latitude,
      alt: bm.position.altitude / 4,
    });
  };

  return (
    <div className="absolute top-16 left-64 z-10 hidden md:block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg px-3 py-2 border backdrop-blur-sm text-xs font-mono"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: open ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.2)',
          color: '#00E5FF',
        }}
      >
        Bookmarks ({bookmarks.length})
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border backdrop-blur-sm w-64 overflow-hidden"
          style={{
            background: 'rgba(13,27,42,0.95)',
            borderColor: 'rgba(0,229,255,0.2)',
          }}
        >
          <div className="p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Bookmark name..."
                className="flex-1 bg-transparent text-xs font-mono text-gray-300 outline-none px-2 py-1.5 rounded border"
                style={{ borderColor: 'rgba(0,229,255,0.2)' }}
              />
              <button
                onClick={handleSave}
                className="text-xs font-mono px-2 py-1.5 rounded"
                style={{
                  background: 'rgba(0,229,255,0.15)',
                  color: '#00E5FF',
                }}
              >
                Save
              </button>
            </div>
          </div>

          {bookmarks.length > 0 && (
            <div
              className="max-h-48 overflow-y-auto"
              style={{ borderTop: '1px solid rgba(0,229,255,0.1)' }}
            >
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 group"
                >
                  <button
                    onClick={() => handleFlyTo(bm)}
                    className="flex-1 text-left text-xs font-mono text-gray-300 truncate"
                  >
                    {bm.name}
                  </button>
                  <span className="text-xs text-gray-600 font-mono hidden group-hover:block">
                    {bm.position.latitude.toFixed(1)},{bm.position.longitude.toFixed(1)}
                  </span>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none opacity-0 group-hover:opacity-100"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {bookmarks.length === 0 && (
            <div className="px-3 pb-3 text-xs text-gray-600 font-mono">
              No bookmarks saved yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
