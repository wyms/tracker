import { useAppStore, type FilterMode } from '../../store/useAppStore';

const filters: { key: FilterMode; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'flir', label: 'FLIR' },
  { key: 'nightvision', label: 'Night Vision' },
  { key: 'crt', label: 'CRT' },
];

export function FilterBar() {
  const { activeFilter, setActiveFilter } = useAppStore();

  return (
    <div className="absolute top-4 left-4 z-10 hidden md:block">
      <div
        className="rounded-lg border backdrop-blur-sm"
        style={{
          background: 'rgba(13,27,42,0.9)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as FilterMode)}
          className="bg-transparent text-xs font-mono px-3 py-2 outline-none cursor-pointer appearance-none pr-8"
          style={{ color: '#00E5FF' }}
        >
          {filters.map(({ key, label }) => (
            <option
              key={key}
              value={key}
              style={{ background: '#0D1B2A', color: '#E0E0E0' }}
            >
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
