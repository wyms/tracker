import * as Cesium from 'cesium';
import type { AircraftState } from '../services/opensky';
import { fetchFlights, type BoundingBox } from '../services/opensky';

const STALE_THRESHOLD = 60_000; // 60 seconds

export class FlightLayer {
  private viewer: Cesium.Viewer;
  private entities: Map<string, { entity: Cesium.Entity; lastUpdate: number }> = new Map();
  private intervalId: number | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  start() {
    this.poll();
    this.intervalId = window.setInterval(() => this.poll(), 10_000);
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clearAll();
  }

  private async poll() {
    const bbox = this.getViewBoundingBox();
    if (!bbox) return;

    try {
      const aircraft = await fetchFlights(bbox);
      this.updateEntities(aircraft);
      return Date.now();
    } catch (e) {
      console.error('Flight poll failed:', e);
      return null;
    }
  }

  private getViewBoundingBox(): BoundingBox | null {
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
      south: Cesium.Math.toDegrees(rect.south),
      west: Cesium.Math.toDegrees(rect.west),
      north: Cesium.Math.toDegrees(rect.north),
      east: Cesium.Math.toDegrees(rect.east),
    };
  }

  private updateEntities(aircraft: AircraftState[]) {
    const now = Date.now();
    const incomingIds = new Set<string>();

    for (const ac of aircraft) {
      if (ac.latitude == null || ac.longitude == null) continue;

      const id = `flight-${ac.icao24}`;
      incomingIds.add(id);

      const position = Cesium.Cartesian3.fromDegrees(
        ac.longitude,
        ac.latitude,
        ac.baro_altitude ?? 10000
      );

      const existing = this.entities.get(id);
      if (existing) {
        existing.entity.position = new Cesium.ConstantPositionProperty(position);
        if (existing.entity.billboard) {
          existing.entity.billboard.rotation = new Cesium.ConstantProperty(
            Cesium.Math.toRadians(-(ac.true_track ?? 0))
          );
        }
        existing.lastUpdate = now;
        (existing.entity as any)._flightData = ac;
      } else {
        const entity = this.viewer.entities.add({
          id,
          name: ac.callsign?.trim() || ac.icao24,
          position,
          billboard: {
            image: '/icons/aircraft.svg',
            scale: 0.4,
            rotation: Cesium.Math.toRadians(-(ac.true_track ?? 0)),
            color: Cesium.Color.CYAN,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
        });
        (entity as any)._flightData = ac;
        (entity as any)._entityType = 'aircraft';
        this.entities.set(id, { entity, lastUpdate: now });
      }
    }

    // Remove stale
    for (const [id, entry] of this.entities) {
      if (now - entry.lastUpdate > STALE_THRESHOLD) {
        this.viewer.entities.remove(entry.entity);
        this.entities.delete(id);
      }
    }
  }

  private clearAll() {
    for (const [, entry] of this.entities) {
      this.viewer.entities.remove(entry.entity);
    }
    this.entities.clear();
  }
}
