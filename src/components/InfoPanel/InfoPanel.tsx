import { useAppStore } from '../../store/useAppStore';

export function InfoPanel() {
  const { selectedEntity, setSelectedEntity } = useAppStore();

  if (!selectedEntity) return null;

  const renderContent = () => {
    switch (selectedEntity.type) {
      case 'aircraft':
        return <AircraftInfo data={selectedEntity.data} />;
      case 'satellite':
        return <SatelliteInfo data={selectedEntity.data} />;
      case 'earthquake':
        return <EarthquakeInfo data={selectedEntity.data} />;
      case 'camera':
        return <CameraInfo data={selectedEntity.data} />;
      default:
        return null;
    }
  };

  const typeLabel = {
    aircraft: 'AIRCRAFT',
    satellite: 'SATELLITE',
    earthquake: 'EARTHQUAKE',
    camera: 'CAMERA',
  }[selectedEntity.type];

  const typeColor = {
    aircraft: '#00E5FF',
    satellite: '#FFEB3B',
    earthquake: '#FF5722',
    camera: '#FF6B35',
  }[selectedEntity.type];

  return (
    <div className="absolute top-16 right-4 z-10 w-72">
      <div
        className="rounded-lg border backdrop-blur-sm overflow-hidden"
        style={{
          background: 'rgba(13,27,42,0.95)',
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: '1px solid rgba(0,229,255,0.15)' }}
        >
          <span
            className="text-xs font-bold tracking-widest"
            style={{ color: typeColor }}
          >
            {typeLabel}
          </span>
          <button
            onClick={() => setSelectedEntity(null)}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-4">{renderContent()}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between text-xs py-1">
      <span className="text-gray-500 font-mono uppercase">{label}</span>
      <span className="text-gray-300 font-mono">{String(value)}</span>
    </div>
  );
}

function AircraftInfo({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-sm font-bold text-white mb-2">
        {String(data.callsign || 'Unknown')}
      </div>
      <InfoRow label="Country" value={data.origin_country as string} />
      <InfoRow
        label="Altitude"
        value={data.altitude != null ? `${Number(data.altitude).toFixed(0)} m` : 'N/A'}
      />
      <InfoRow
        label="Speed"
        value={data.velocity != null ? `${Number(data.velocity).toFixed(0)} m/s` : 'N/A'}
      />
      <InfoRow
        label="Heading"
        value={data.true_track != null ? `${Number(data.true_track).toFixed(1)}°` : 'N/A'}
      />
      <InfoRow
        label="V/Rate"
        value={
          data.vertical_rate != null
            ? `${Number(data.vertical_rate).toFixed(1)} m/s`
            : 'N/A'
        }
      />
      <InfoRow label="On Ground" value={data.on_ground ? 'Yes' : 'No'} />
    </div>
  );
}

function SatelliteInfo({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-sm font-bold text-white mb-2">
        {String(data.name || 'Unknown')}
      </div>
      <InfoRow label="NORAD ID" value={data.noradId as number} />
      <InfoRow label="Object ID" value={data.objectId as string} />
      <InfoRow
        label="Inclination"
        value={data.inclination != null ? `${Number(data.inclination).toFixed(2)}°` : 'N/A'}
      />
      <InfoRow
        label="Mean Motion"
        value={
          data.meanMotion != null
            ? `${Number(data.meanMotion).toFixed(4)} rev/day`
            : 'N/A'
        }
      />
      <InfoRow label="Epoch" value={data.epoch as string} />
    </div>
  );
}

function EarthquakeInfo({ data }: { data: Record<string, unknown> }) {
  const time = data.time ? new Date(data.time as number).toLocaleString() : 'N/A';
  return (
    <div className="space-y-0.5">
      <div className="text-sm font-bold text-white mb-2">
        M{String(data.mag)} Earthquake
      </div>
      <InfoRow label="Location" value={data.place as string} />
      <InfoRow label="Magnitude" value={data.mag as number} />
      <InfoRow
        label="Depth"
        value={data.depth != null ? `${Number(data.depth).toFixed(1)} km` : 'N/A'}
      />
      <InfoRow label="Time" value={time} />
      {typeof data.url === 'string' && data.url && (
        <a
          href={data.url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-xs text-center py-1.5 rounded"
          style={{
            color: '#00E5FF',
            background: 'rgba(0,229,255,0.1)',
            border: '1px solid rgba(0,229,255,0.3)',
          }}
        >
          View on USGS &rarr;
        </a>
      )}
    </div>
  );
}

function CameraInfo({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      <div className="text-sm font-bold text-white mb-2">
        {String(data.location_name || `Camera ${data.camera_id}`)}
      </div>
      <InfoRow label="Camera ID" value={data.camera_id as string} />
      <InfoRow label="Status" value={data.camera_status as string} />
      <InfoRow label="Comm" value={data.comm_status as string} />
      <InfoRow label="Manufacturer" value={data.camera_mfg as string} />
    </div>
  );
}
