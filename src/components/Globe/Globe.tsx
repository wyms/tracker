import { useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import { useAppStore } from '../../store/useAppStore';
import { FlightLayer } from '../../layers/FlightLayer';
import { FLIGHT_REGIONS } from '../../data/flightRegions';
import { SatelliteLayer } from '../../layers/SatelliteLayer';
import { EarthquakeLayer } from '../../layers/EarthquakeLayer';
import { CameraLayer } from '../../layers/CameraLayer';
import { HistoricalTrackLayer } from '../../layers/HistoricalTrackLayer';
import { WeatherLayer } from '../../layers/WeatherLayer';
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
    historicalTrack: HistoricalTrackLayer | null;
    weather: WeatherLayer | null;
  }>({
    flights: null,
    satellites: null,
    earthquakes: null,
    cameras: null,
    historicalTrack: null,
    weather: null,
  });
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const labelsLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const filterStageRef = useRef<Cesium.PostProcessStage | null>(null);
  const measureEntitiesRef = useRef<Cesium.Entity[]>([]);

  const {
    layers,
    activeFilter,
    setCameraPosition,
    setSelectedEntity,
    setDataTimestamp,
    activeTrack,
    activeHistoricalFlight,
    flyToTarget,
    setFlyToTarget,
    resolvedIcao24,
    setEntityCount,
    trailsEnabled,
    measureMode,
    addMeasurePoint,
    measurePoints,
    measureResult,
    screenshotRequested,
    clearScreenshotRequest,
    addNotification,
  } = useAppStore();

  const handleEntityClick = useCallback(
    (viewer: Cesium.Viewer) => {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

      handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
        // Handle measurement mode
        const currentMeasureMode = useAppStore.getState().measureMode;
        if (currentMeasureMode) {
          const ray = viewer.camera.getPickRay(movement.position);
          if (ray) {
            const cartesian = viewer.scene.globe?.pick(ray, viewer.scene);
            if (cartesian) {
              const carto = Cesium.Cartographic.fromCartesian(cartesian);
              useAppStore.getState().addMeasurePoint({
                lat: Cesium.Math.toDegrees(carto.latitude),
                lon: Cesium.Math.toDegrees(carto.longitude),
              });
            }
          }
          return;
        }

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
                    icao24: data.icao24,
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
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
        },
      },
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
        tilesetRef.current = tileset;
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
    const flightLayer = new FlightLayer(viewer);
    flightLayer.setOnCountUpdate((count) => setEntityCount('flights', count));

    const satLayer = new SatelliteLayer(viewer);
    satLayer.setOnCountUpdate((count) => setEntityCount('satellites', count));

    const quakeLayer = new EarthquakeLayer(viewer);
    quakeLayer.setOnCountUpdate((count) => setEntityCount('earthquakes', count));
    quakeLayer.setOnDataUpdate((quakes) => useAppStore.getState().setEarthquakeList(quakes));
    quakeLayer.setOnNewQuake((mag, place) => {
      addNotification({
        type: 'warning',
        title: `M${mag.toFixed(1)} Earthquake`,
        message: place,
      });
    });

    const camLayer = new CameraLayer(viewer);
    camLayer.setOnCountUpdate((count) => setEntityCount('cameras', count));

    layersRef.current.flights = flightLayer;
    layersRef.current.satellites = satLayer;
    layersRef.current.earthquakes = quakeLayer;
    layersRef.current.cameras = camLayer;
    layersRef.current.historicalTrack = new HistoricalTrackLayer(viewer);
    layersRef.current.weather = new WeatherLayer(viewer);

    viewerRef.current = viewer;

    // Trigger initial render
    viewer.scene.requestRender();

    return () => {
      handler.destroy();
      layersRef.current.flights?.stop();
      layersRef.current.satellites?.stop();
      layersRef.current.earthquakes?.stop();
      layersRef.current.cameras?.stop();
      layersRef.current.weather?.stop();
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

  useEffect(() => {
    const l = layersRef.current;
    if (layers.weather) {
      l.weather?.start();
      setDataTimestamp('weather', Date.now());
    } else {
      l.weather?.stop();
    }
  }, [layers.weather]);

  // Labels overlay (Google 2D roadmap on 3D tiles)
  useEffect(() => {
    const tileset = tilesetRef.current;
    if (!tileset) return;

    if (layers.labels) {
      Cesium.Google2DImageryProvider.fromUrl({
        mapType: 'roadmap',
        overlayLayerType: 'layerRoadmap',
      }).then((provider) => {
        if (!tilesetRef.current) return;
        const layer = tilesetRef.current.imageryLayers.addImageryProvider(provider as Cesium.ImageryProvider);
        layer.alpha = 0.7;
        labelsLayerRef.current = layer;
        viewerRef.current?.scene.requestRender();
      }).catch((e) => {
        console.error('Failed to load Google labels overlay:', e);
      });
    } else {
      if (labelsLayerRef.current) {
        tilesetRef.current?.imageryLayers.remove(labelsLayerRef.current);
        labelsLayerRef.current = null;
        viewerRef.current?.scene.requestRender();
      }
    }
  }, [layers.labels]);

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

  // Historical track rendering
  useEffect(() => {
    const trackLayer = layersRef.current.historicalTrack;
    if (!trackLayer) return;
    if (activeTrack) {
      trackLayer.showTrack(activeTrack, {
        departureAirport: activeHistoricalFlight?.estDepartureAirport,
        arrivalAirport: activeHistoricalFlight?.estArrivalAirport,
      });
    } else {
      trackLayer.clear();
    }
  }, [activeTrack, activeHistoricalFlight]);

  // Highlight selected aircraft in flight layer
  useEffect(() => {
    layersRef.current.flights?.setHighlighted(resolvedIcao24);
  }, [resolvedIcao24]);

  // Trails toggle
  useEffect(() => {
    layersRef.current.flights?.setTrailsEnabled(trailsEnabled);
  }, [trailsEnabled]);

  // Sync auth state to FlightLayer
  const user = useAppStore((s) => s.user);
  useEffect(() => {
    layersRef.current.flights?.setAuthenticated(!!user);
  }, [user]);

  // Sync flight region to FlightLayer
  const flightRegion = useAppStore((s) => s.flightRegion);
  useEffect(() => {
    const fl = layersRef.current.flights;
    if (!fl) return;
    if (flightRegion === 'viewport') {
      fl.setBboxOverride(null);
    } else if (flightRegion === 'world') {
      fl.setBboxOverride('world');
    } else {
      const region = FLIGHT_REGIONS.find((r) => r.id === flightRegion);
      if (region?.bbox) {
        fl.setBboxOverride(region.bbox);
      }
    }
  }, [flightRegion]);

  // Camera flyTo bridge
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToTarget) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        flyToTarget.lon,
        flyToTarget.lat,
        Math.max(flyToTarget.alt * 4, 50000)
      ),
      duration: 1.5,
    });

    setFlyToTarget(null);
  }, [flyToTarget, setFlyToTarget]);

  // Screenshot capture
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !screenshotRequested) return;

    clearScreenshotRequest();
    viewer.scene.requestRender();

    requestAnimationFrame(() => {
      try {
        const canvas = viewer.scene.canvas;
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `gcc-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        link.href = dataUrl;
        link.click();
        addNotification({ type: 'success', title: 'Screenshot Saved', message: link.download });
      } catch (e) {
        console.error('Screenshot failed:', e);
        addNotification({ type: 'warning', title: 'Screenshot Failed', message: 'Could not capture the current view' });
      }
    });
  }, [screenshotRequested, clearScreenshotRequest, addNotification]);

  // Measurement visualization
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Clear previous measure entities
    for (const e of measureEntitiesRef.current) {
      viewer.entities.remove(e);
    }
    measureEntitiesRef.current = [];

    // Draw measure points
    for (const pt of measurePoints) {
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 100),
        point: {
          pixelSize: 8,
          color: Cesium.Color.fromCssColorString('#4CAF50'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      measureEntitiesRef.current.push(entity);
    }

    // Draw line between two points
    if (measureResult) {
      const lineEntity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            measureResult.from.lon, measureResult.from.lat,
            measureResult.to.lon, measureResult.to.lat,
          ]),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#4CAF50'),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });
      measureEntitiesRef.current.push(lineEntity);
    }

    viewer.scene.requestRender();
  }, [measurePoints, measureResult]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0"
      style={{ background: '#0D1B2A', cursor: measureMode ? 'crosshair' : 'default' }}
    />
  );
}
