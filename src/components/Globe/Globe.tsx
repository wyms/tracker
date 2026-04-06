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
import { GroundStopLayer } from '../../layers/GroundStopLayer';
import { FireLayer } from '../../layers/FireLayer';
import { GdeltLayer } from '../../layers/GdeltLayer';
import { RadiationLayer } from '../../layers/RadiationLayer';
import { EonetLayer } from '../../layers/EonetLayer';
import { ArtemisLayer } from '../../layers/ArtemisLayer';
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
    groundStops: GroundStopLayer | null;
    fires: FireLayer | null;
    gdelt: GdeltLayer | null;
    radiation: RadiationLayer | null;
    eonet: EonetLayer | null;
    artemis: ArtemisLayer | null;
  }>({
    flights: null,
    satellites: null,
    earthquakes: null,
    cameras: null,
    historicalTrack: null,
    weather: null,
    groundStops: null,
    fires: null,
    gdelt: null,
    radiation: null,
    eonet: null,
    artemis: null,
  });
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const labelsLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const filterStageRef = useRef<Cesium.PostProcessStage | null>(null);
  const measureEntitiesRef = useRef<Cesium.Entity[]>([]);
  const lastScreenshotRef = useRef<number>(0);

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

          // Handle entity pick (flights, earthquakes, cameras, artemis)
          if (picked.id && picked.id instanceof Cesium.Entity) {
            const entity = picked.id;
            const entityType = (entity as any)._entityType;

            if (entityType === 'artemis') {
              const data = (entity as any)._artemisData;
              if (data) {
                const posStr = layersRef.current.artemis?.getPositionString() || '';
                setSelectedEntity({
                  type: 'artemis',
                  id: 'artemis-orion',
                  data: {
                    name: data.OBJECT_NAME || 'ORION (ARTEMIS II)',
                    mission: data.mission || 'Artemis II',
                    vehicle: data.vehicle || 'Orion MPCV',
                    phase: posStr.split('·')[0]?.trim(),
                    distanceKm: posStr.match(/(\d[\d,]*)\s*km/)?.[1]?.replace(/,/g, ''),
                    missionTime: posStr.split('·')[2]?.trim(),
                  },
                });
                layersRef.current.artemis?.flyTo();
                return;
              }
            }

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

            if (entityType === 'eonetEvent') {
              const data = (entity as any)._eonetData;
              if (data) {
                setSelectedEntity({
                  type: 'eonetEvent',
                  id: data.id,
                  data: {
                    title: data.title,
                    category: data.category,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    date: data.date,
                    source: data.source,
                    sourceUrl: data.sourceUrl,
                  },
                });
                return;
              }
            }

            if (entityType === 'gdeltEvent') {
              const data = (entity as any)._gdeltData;
              if (data) {
                setSelectedEntity({
                  type: 'gdeltEvent',
                  id: `gdelt-${data.latitude}-${data.longitude}`,
                  data: {
                    name: data.name,
                    url: data.url,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    tone: data.tonez,
                    domain: data.domain,
                    shareimage: data.shareimage,
                  },
                });
                return;
              }
            }

            if (entityType === 'groundStop') {
              const data = (entity as any)._faaData;
              if (data) {
                setSelectedEntity({
                  type: 'groundStop',
                  id: `${data.airport}-${data.type}`,
                  data,
                });
                return;
              }
            }
          }

          // Handle point primitives (fires, radiation — same pattern as satellites)
          if (picked.primitive && picked.primitive._radiationData) {
            const data = picked.primitive._radiationData;
            setSelectedEntity({
              type: 'radiation',
              id: `rad-${data.id}`,
              data: {
                latitude: data.latitude,
                longitude: data.longitude,
                value: data.value,
                unit: data.unit,
                captured_at: data.captured_at,
                device_id: data.device_id,
              },
            });
            return;
          }

          if (picked.primitive && picked.primitive._fireData) {
            const data = picked.primitive._fireData;
            setSelectedEntity({
              type: 'fire',
              id: `fire-${data.latitude}-${data.longitude}`,
              data: {
                latitude: data.latitude,
                longitude: data.longitude,
                brightness: data.brightness,
                frp: data.frp,
                confidence: data.confidence,
                acq_date: data.acq_date,
                acq_time: data.acq_time,
                satellite: data.satellite,
                daynight: data.daynight,
              },
            });
            return;
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

    // Set initial zoom to show full globe
    const isMobile = window.innerWidth < 768;
    const fullGlobeView = Cesium.Cartesian3.fromDegrees(0, 20, isMobile ? 16_000_000 : 25_000_000);
    viewer.camera.setView({ destination: fullGlobeView });

    // Load Google Photorealistic 3D Tiles
    Cesium.createGooglePhotorealistic3DTileset()
      .then((tileset) => {
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        layersRef.current.weather?.setTileset(tileset);
        // Re-apply zoom after tiles load in case tileset reset the camera
        viewer.camera.setView({ destination: fullGlobeView });
        viewer.scene.requestRender();
        // And again after a delay in case of deferred camera resets
        setTimeout(() => {
          viewer.camera.setView({ destination: fullGlobeView });
          viewer.scene.requestRender();
        }, 1000);
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
    flightLayer.setOnCountUpdate((count) => {
      setEntityCount('flights', count);
      setDataTimestamp('flights', Date.now());
    });

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

    const groundStopLayer = new GroundStopLayer(viewer);
    groundStopLayer.setOnCountUpdate((count) => setEntityCount('groundStops', count));

    layersRef.current.flights = flightLayer;
    layersRef.current.satellites = satLayer;
    layersRef.current.earthquakes = quakeLayer;
    layersRef.current.cameras = camLayer;
    layersRef.current.historicalTrack = new HistoricalTrackLayer(viewer);
    layersRef.current.weather = new WeatherLayer(viewer);
    layersRef.current.groundStops = groundStopLayer;

    const fireLayer = new FireLayer(viewer);
    fireLayer.setOnCountUpdate((count) => setEntityCount('fires', count));
    fireLayer.setOnDataUpdate((hotspots) => useAppStore.getState().setFireList(hotspots));
    layersRef.current.fires = fireLayer;

    const gdeltLayer = new GdeltLayer(viewer);
    gdeltLayer.setOnCountUpdate((count) => setEntityCount('gdelt', count));
    layersRef.current.gdelt = gdeltLayer;

    const radiationLayer = new RadiationLayer(viewer);
    radiationLayer.setOnCountUpdate((count) => setEntityCount('radiation', count));
    layersRef.current.radiation = radiationLayer;

    const eonetLayer = new EonetLayer(viewer);
    eonetLayer.setOnCountUpdate((count) => setEntityCount('eonet', count));
    layersRef.current.eonet = eonetLayer;

    const artemisLayer = new ArtemisLayer(viewer);
    artemisLayer.setOnCountUpdate((count) => setEntityCount('artemis', count));
    layersRef.current.artemis = artemisLayer;

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
      layersRef.current.groundStops?.stop();
      layersRef.current.fires?.stop();
      layersRef.current.gdelt?.stop();
      layersRef.current.radiation?.stop();
      layersRef.current.eonet?.stop();
      layersRef.current.artemis?.stop();
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

  useEffect(() => {
    const l = layersRef.current;
    if (layers.groundStops) {
      l.groundStops?.start();
      setDataTimestamp('groundStops', Date.now());
    } else {
      l.groundStops?.stop();
    }
  }, [layers.groundStops]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.fires) {
      l.fires?.start();
      setDataTimestamp('fires', Date.now());
    } else {
      l.fires?.stop();
    }
  }, [layers.fires]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.gdelt) {
      l.gdelt?.start();
      setDataTimestamp('gdelt', Date.now());
    } else {
      l.gdelt?.stop();
    }
  }, [layers.gdelt]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.radiation) {
      l.radiation?.start();
      setDataTimestamp('radiation', Date.now());
    } else {
      l.radiation?.stop();
    }
  }, [layers.radiation]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.eonet) {
      l.eonet?.start();
      setDataTimestamp('eonet', Date.now());
    } else {
      l.eonet?.stop();
    }
  }, [layers.eonet]);

  useEffect(() => {
    const l = layersRef.current;
    if (layers.artemis) {
      l.artemis?.start().then(() => {
        const pos = l.artemis?.getPositionString();
        if (pos) {
          addNotification({
            type: 'success',
            title: 'Artemis II — Orion',
            message: pos,
          });
          l.artemis?.flyTo();
        }
      });
      setDataTimestamp('artemis', Date.now());
    } else {
      l.artemis?.stop();
    }
  }, [layers.artemis]);

  // Labels overlay (Google 2D roadmap on 3D tiles)
  useEffect(() => {
    if (layers.labels) {
      // Wait for tileset to be available (may load slower on mobile)
      const tryAddLabels = () => {
        const tileset = tilesetRef.current;
        if (!tileset) {
          setTimeout(tryAddLabels, 500);
          return;
        }
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
      };
      tryAddLabels();
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
    const isAuth = !!user;
    layersRef.current.flights?.setAuthenticated(isAuth);
    layersRef.current.satellites?.setAuthenticated(isAuth);
    layersRef.current.earthquakes?.setAuthenticated(isAuth);
    layersRef.current.cameras?.setAuthenticated(isAuth);
    layersRef.current.groundStops?.setAuthenticated(isAuth);
    layersRef.current.fires?.setAuthenticated(isAuth);
    layersRef.current.gdelt?.setAuthenticated(isAuth);
    layersRef.current.radiation?.setAuthenticated(isAuth);
    layersRef.current.eonet?.setAuthenticated(isAuth);
  }, [user]);

  // Sync flight region to FlightLayer
  const flightRegion = useAppStore((s) => s.flightRegion);
  const userLocation = useAppStore((s) => s.userLocation);
  useEffect(() => {
    const fl = layersRef.current.flights;
    if (!fl) return;
    if (flightRegion === 'nearme') {
      if (userLocation) {
        fl.setNearMeCenter(userLocation);
      }
    } else {
      fl.setNearMeCenter(null);
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
    }
  }, [flightRegion, userLocation]);

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

    const now = Date.now();
    if (now - lastScreenshotRef.current < 3000) {
      clearScreenshotRequest();
      return;
    }
    lastScreenshotRef.current = now;

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
      style={{ background: '#0D1B2A', cursor: measureMode ? 'crosshair' : 'default', touchAction: 'none' }}
    />
  );
}
