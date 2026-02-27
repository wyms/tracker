import * as Cesium from 'cesium';
import type { EarthquakeFeature } from '../services/usgs';
import { fetchEarthquakes } from '../services/usgs';

function magnitudeToRadius(mag: number): number {
  if (mag < 3) return 5000;
  if (mag < 5) return 5000 + ((mag - 3) / 2) * 25000;
  if (mag < 7) return 30000 + ((mag - 5) / 2) * 70000;
  return 100000;
}

function magnitudeToColor(mag: number): Cesium.Color {
  if (mag < 3) return Cesium.Color.fromCssColorString('#00FF88');
  if (mag < 5) return Cesium.Color.YELLOW;
  if (mag < 7) return Cesium.Color.ORANGE;
  return Cesium.Color.RED;
}

export class EarthquakeLayer {
  private viewer: Cesium.Viewer;
  private entities: Map<string, Cesium.Entity> = new Map();
  private intervalId: number | null = null;
  private pulseCallback: (() => void) | null = null;
  private onCountUpdate: ((count: number) => void) | null = null;
  private onNewQuake: ((mag: number, place: string) => void) | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  setOnNewQuake(cb: (mag: number, place: string) => void) {
    this.onNewQuake = cb;
  }

  async start() {
    await this.poll();
    this.intervalId = window.setInterval(() => this.poll(), 60_000);
    this.startPulse();
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stopPulse();
    this.clearAll();
  }

  private async poll(): Promise<number | null> {
    try {
      const quakes = await fetchEarthquakes();
      this.updateEntities(quakes);
      return Date.now();
    } catch (e) {
      console.error('Earthquake poll failed:', e);
      return null;
    }
  }

  private updateEntities(quakes: EarthquakeFeature[]) {
    const incomingIds = new Set<string>();
    const prevIds = new Set(this.entities.keys());

    for (const quake of quakes) {
      const id = `quake-${quake.id}`;
      incomingIds.add(id);

      if (this.entities.has(id)) continue;

      // Notify about new significant quakes
      if (!prevIds.has(id) && prevIds.size > 0) {
        const mag = quake.properties.mag ?? 0;
        if (mag >= 4) {
          this.onNewQuake?.(mag, quake.properties.place ?? 'Unknown');
        }
      }

      const [lon, lat, depth] = quake.geometry.coordinates;
      const mag = quake.properties.mag ?? 0;
      const color = magnitudeToColor(mag);
      const radius = magnitudeToRadius(mag);

      const entity = this.viewer.entities.add({
        id,
        name: quake.properties.title,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: new Cesium.ColorMaterialProperty(color.withAlpha(0.4)),
          outline: true,
          outlineColor: color.withAlpha(0.8),
          outlineWidth: 2,
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      (entity as any)._quakeData = {
        mag,
        place: quake.properties.place,
        time: quake.properties.time,
        depth,
        url: quake.properties.url,
        title: quake.properties.title,
      };
      (entity as any)._entityType = 'earthquake';
      this.entities.set(id, entity);
    }

    // Remove quakes no longer in feed
    for (const [id, entity] of this.entities) {
      if (!incomingIds.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
      }
    }

    this.onCountUpdate?.(this.entities.size);
  }

  private startPulse() {
    let phase = 0;
    const tick = () => {
      phase += 0.05;
      const scale = 0.8 + 0.2 * Math.sin(phase);

      for (const [, entity] of this.entities) {
        if (entity.ellipse) {
          const baseData = (entity as any)._quakeData;
          if (baseData) {
            const baseRadius = magnitudeToRadius(baseData.mag);
            entity.ellipse.semiMajorAxis = new Cesium.ConstantProperty(baseRadius * scale);
            entity.ellipse.semiMinorAxis = new Cesium.ConstantProperty(baseRadius * scale);
          }
        }
      }
      this.viewer.scene.requestRender();
    };

    this.pulseCallback = tick;
    const pulseInterval = setInterval(tick, 50);
    (this as any)._pulseInterval = pulseInterval;
  }

  private stopPulse() {
    if ((this as any)._pulseInterval) {
      clearInterval((this as any)._pulseInterval);
      (this as any)._pulseInterval = null;
    }
    this.pulseCallback = null;
  }

  private clearAll() {
    for (const [, entity] of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}
