import * as Cesium from 'cesium';
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from 'satellite.js';
import type { SatelliteGP } from '../services/celestrak';
import { fetchStations, fetchActiveSatellites } from '../services/celestrak';

interface SatRecord {
  gp: SatelliteGP;
  satrec: ReturnType<typeof twoline2satrec>;
  point: any;
}

function classifySatellite(name: string): { color: Cesium.Color; category: string } {
  const upper = name.toUpperCase();
  if (upper.includes('ISS') || upper === 'ZARYA') return { color: Cesium.Color.WHITE, category: 'ISS' };
  if (upper.includes('STARLINK')) return { color: Cesium.Color.fromCssColorString('#4488FF'), category: 'Starlink' };
  if (upper.includes('GPS') || upper.includes('NAVSTAR')) return { color: Cesium.Color.fromCssColorString('#00FF88'), category: 'GPS' };
  return { color: Cesium.Color.YELLOW, category: 'Other' };
}

export class SatelliteLayer {
  private viewer: Cesium.Viewer;
  private pointCollection: Cesium.PointPrimitiveCollection;
  private satellites: SatRecord[] = [];
  private updateIntervalId: number | null = null;
  private orbitEntity: Cesium.Entity | null = null;
  private loaded = false;
  private onCountUpdate: ((count: number) => void) | null = null;
  private authenticated = false;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.pointCollection = new Cesium.PointPrimitiveCollection();
    this.viewer.scene.primitives.add(this.pointCollection);
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  setAuthenticated(authenticated: boolean) {
    this.authenticated = authenticated;
  }

  async start() {
    if (!this.loaded) {
      await this.loadData();
      this.loaded = true;
    }
    this.updatePositions();
    this.updateIntervalId = window.setInterval(() => this.updatePositions(), 2000);
  }

  stop() {
    if (this.updateIntervalId !== null) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.clearAll();
    this.loaded = false;
  }

  private async loadData() {
    try {
      const [stations, active] = await Promise.all([
        fetchStations(),
        fetchActiveSatellites(),
      ]);

      const allSats = [...stations, ...active];
      // Deduplicate by NORAD_CAT_ID
      const seen = new Set<number>();
      const unique: SatelliteGP[] = [];
      for (const s of allSats) {
        if (!seen.has(s.NORAD_CAT_ID)) {
          seen.add(s.NORAD_CAT_ID);
          unique.push(s);
        }
      }

      const capped = !this.authenticated && unique.length > 50 ? unique.slice(0, 50) : unique;

      for (const gp of capped) {
        try {
          const satrec = twoline2satrec(gp.TLE_LINE1, gp.TLE_LINE2);
          const { color } = classifySatellite(gp.OBJECT_NAME);
          const point = this.pointCollection.add({
            position: Cesium.Cartesian3.ZERO,
            pixelSize: 3,
            color,
            show: false,
          });
          (point as any)._satData = gp;
          (point as any)._entityType = 'satellite';
          this.satellites.push({ gp, satrec, point });
        } catch {
          // Skip invalid TLEs
        }
      }
      this.onCountUpdate?.(this.satellites.length);
    } catch (e) {
      console.error('Failed to load satellite data:', e);
    }
  }

  private updatePositions() {
    const now = new Date();
    const gmst = gstime(now);

    for (const sat of this.satellites) {
      try {
        const result = propagate(sat.satrec, now);
        if (!result || !result.position || typeof result.position === 'boolean') {
          sat.point.show = false;
          continue;
        }
        const pos = result.position;
        const geo = eciToGeodetic(pos as any, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const alt = geo.height * 1000; // km to m

        if (isNaN(lat) || isNaN(lon) || isNaN(alt)) {
          sat.point.show = false;
          continue;
        }

        sat.point.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
        sat.point.show = true;
      } catch {
        sat.point.show = false;
      }
    }

    this.viewer.scene.requestRender();
  }

  showOrbit(noradId: number) {
    this.clearOrbit();
    const sat = this.satellites.find((s) => s.gp.NORAD_CAT_ID === noradId);
    if (!sat) return;

    const period = (2 * Math.PI) / (sat.gp.MEAN_MOTION * (2 * Math.PI / 86400));
    const periodMs = period * 1000;
    const now = Date.now();
    const positions: Cesium.Cartesian3[] = [];

    for (let t = 0; t <= periodMs; t += 60_000) {
      const date = new Date(now + t);
      try {
        const result = propagate(sat.satrec, date);
        if (!result || !result.position || typeof result.position === 'boolean') continue;
        const orbitPos = result.position;
        const gmst = gstime(date);
        const geo = eciToGeodetic(orbitPos as any, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const alt = geo.height * 1000;
        if (!isNaN(lat) && !isNaN(lon) && !isNaN(alt)) {
          positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
        }
      } catch {
        // skip
      }
    }

    if (positions.length > 1) {
      this.orbitEntity = this.viewer.entities.add({
        id: 'satellite-orbit',
        polyline: {
          positions,
          width: 1.5,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.CYAN.withAlpha(0.5)),
        },
      });
    }
  }

  clearOrbit() {
    if (this.orbitEntity) {
      this.viewer.entities.remove(this.orbitEntity);
      this.orbitEntity = null;
    }
  }

  private clearAll() {
    this.pointCollection.removeAll();
    this.satellites = [];
    this.clearOrbit();
  }

  getPointCollection(): Cesium.PointPrimitiveCollection {
    return this.pointCollection;
  }
}
