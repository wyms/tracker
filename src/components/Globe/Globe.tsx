import { useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import { useAppStore } from '../../store/useAppStore';
import { FlightLayer } from '../../layers/FlightLayer';
import { SatelliteLayer } from '../../layers/SatelliteLayer';
import { EarthquakeLayer } from '../../layers/EarthquakeLayer';
import { CameraLayer } from '../../layers/CameraLayer';
import { fragmentShader as flirShader } from '../../filters/flir';
import { fragmentShader as nightvisionShader } from '../../filters/nightvision';
import { fragmentShader as crtShader } from '../../filters/crt';
import type { FilterMode, SelectedEntity } from '../../store/useAppStore';

export function Globe() {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<{
    flights: FlightLayer | null;
    satellites: SatelliteLayer | null;
    earthquakes: EarthquakeLayer | null;
    cameras: CameraLayer | null;
  }>({ flights: null, satellites: null, earthquakes: null, cameras: null });
  const filterStageRef = useRef<Cesium.PostProcessStage | null>(null);

  const {
    layers,
    activeFilter,
    setCameraPosition,
    setSelectedEntity,
    setDataTimestamp,
  } = useAppStore();

  const handleEntityClick = useCallback(
    (viewer: Cesium.Viewer) => {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

      handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
        // Check entity pick first
        const picked = viewer.scene.pick(movement.position);

        if (Cesium.defined(picked)) {
          // Handle point primitive (satellites)
          if (picked.primitive && picked.primitive._satData) {
            const satData = picked.primitive._satData;
            const satLayer = layersRef.current.satellites;
            if (satLayer) {
              satLayer.showOrbit(satData.NORAD_CAT_ID);
            }
            setSelectedEntity({
              type: 'satellite',
              id: String(satData.NORAD_CAT_ID),
              data: {
                name: satData.OBJECT_NAME,
                noradId: satData.NORAD_CAT_ID,
                objectId: satData.OBJECT_ID,
                inclination: satData.INCLINATION,
                meanMotion: satData.MEAN_MOTION,
                epoch: satData.EPOCH,
              },
            });
            return;
          }

          // Handle entity pick (flights, earthquakes, cameras)
          if (picked.id && picked.id instanceof Cesium.Entity) {
            const entity = picked.id;
            const entityType = (entity as any)._entityType;

            if (entityType === 'aircraft') {
              const data = (entity as any)._flightData;
              if (data) {
                setSelectedEntity({
                  type: 'aircraft',
                  id: data.icao24,
                  data: {
                    callsign: data.callsign?.trim() || data.icao24,
                    altitude: data.baro_altitude,
                    velocity: data.velocity,
                    origin_country: data.origin_country,
                    true_track: data.true_track,
                    vertical_rate: data.vertical_rate,
                    on_ground: data.on_ground,
                  },
                });
                return;
              }
            }

            if (entityType === 'earthquake') {
              const data = (entity as any)._quakeData;
              if (data) {
                setSelectedEntity({
                  type: 'earthquake',
                  id: entity.id,
                  data,
                });
                return;
              }
            }

            if (entityType === 'camera') {
              const data = (entity as any)._cameraData;
              if (data) {
                setSelectedEntity({
                  type: 'camera',
                  id: data.camera_id,
                  data,
                });
                return;
              }
            }
          }
        }

        // Click on nothing - deselect
        setSelectedEntity(null);
        const satLayer = layersRef.current.satellites;
        if (satLayer) satLayer.clearOrbit();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      return handler;
    },
    [setSelectedEntity]
  );

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current) return;

    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
    const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;
    if (googleKey) Cesium.GoogleMaps.defaultApiKey = googleKey;

    Cesium.RequestScheduler.requestsByServer['tile.googleapis.com:443'] = 18;

    const viewer = new Cesium.Viewer(containerRef.current, {
      globe: false,
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      homeButton: false,
      fullscreenButton: false,
      geocoder: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    // Set dark sky
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0D1B2A');
    viewer.scene.skyBox = undefined as any;
    viewer.scene.sun = undefined as any;
    viewer.scene.moon = undefined as any;
    viewer.scene.skyAtmosphere = undefined as any;

    // Load Google Photorealistic 3D Tiles
    Cesium.createGooglePhotorealistic3DTileset()
      .then((tileset) => {
        viewer.scene.primitives.add(tileset);
        viewer.scene.requestRender();
      })
      .catch((e) => {
        console.error('Failed to load Google 3D Tiles:', e);
      });

    // Camera move listener for HUD
    viewer.camera.changed.addEventListener(() => {
      const carto = viewer.camera.positionCartographic;
      setCameraPosition({
        latitude: Cesium.Math.toDegrees(carto.latitude),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        altitude: carto.height,
      });
    });
    viewer.camera.percentageChanged = 0.01;

    // Click handler
    const handler = handleEntityClick(viewer);

    // Initialize layers
    layersRef.current.flights = new FlightLayer(viewer);
    layersRef.current.satellites = new SatelliteLayer(viewer);
    layersRef.current.earthquakes = new EarthquakeLayer(viewer);
    layersRef.current.cameras = new CameraLayer(viewer);

    viewerRef.current = viewer;

    // Trigger initial render
    viewer.scene.requestRender();

    return () => {
      handler.destroy();
      layersRef.current.flights?.stop();
      layersRef.current.satellites?.stop();
      layersRef.current.earthquakes?.stop();
      layersRef.current.cameras?.stop();
      viewer.destroy();
    };
  }, []);

  // Manage layer toggles
  useEffect(() => {
    const l = layersRef.current;
    if (layers.flights) {
      l.flights?.start();
      setDataTimestamp('flights', Date.now());
    } else {
      l.flights?.stop();
    }
  }, [layers.flights]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.satellites) {
      l.satellites?.start();
      setDataTimestamp('satellites', Date.now());
    } else {
      l.satellites?.stop();
    }
  }, [layers.satellites]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.earthquakes) {
      l.earthquakes?.start();
      setDataTimestamp('earthquakes', Date.now());
    } else {
      l.earthquakes?.stop();
    }
  }, [layers.earthquakes]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.cameras) {
      l.cameras?.start();
      setDataTimestamp('cameras', Date.now());
    } else {
      l.cameras?.stop();
    }
  }, [layers.cameras]);

  // Manage filters
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove existing filter
    if (filterStageRef.current) {
      viewer.scene.postProcessStages.remove(filterStageRef.current);
      filterStageRef.current = null;
    }

    const shaderMap: Record<string, string | null> = {
      normal: null,
      flir: flirShader,
      nightvision: nightvisionShader,
      crt: crtShader,
    };

    const shader = shaderMap[activeFilter];
    if (shader) {
      const stage = new Cesium.PostProcessStage({ fragmentShader: shader });
      viewer.scene.postProcessStages.add(stage);
      filterStageRef.current = stage;
    }

    viewer.scene.requestRender();
  }, [activeFilter]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0"
      style={{ background: '#0D1B2A' }}
    />
  );
}
