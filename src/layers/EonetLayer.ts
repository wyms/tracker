import * as Cesium from 'cesium';
import { fetchEonetEvents, type EonetEvent } from '../services/eonet';

const CATEGORY_STYLES: Record<string, { color: string; size: number }> = {
  'Volcanoes': { color: '#FF4500', size: 10 },
  'Severe Storms': { color: '#00BFFF', size: 8 },
  'Wildfires': { color: '#FF6600', size: 7 },
  'Sea and Lake Ice': { color: '#B0E0E6', size: 6 },
  'Icebergs': { color: '#E0FFFF', size: 6 },
  'Floods': { color: '#4169E1', size: 7 },
  'Landslides': { color: '#8B4513', size: 7 },
  'Drought': { color: '#DAA520', size: 7 },
  'Dust and Haze': { color: '#D2B48C', size: 5 },
  'Earthquakes': { color: '#FF5722', size: 8 },
  'Snow': { color: '#FFFAFA', size: 5 },
  'Temperature Extremes': { color: '#FF1493', size: 6 },
  'Water Color': { color: '#20B2AA', size: 5 },
  'Manmade': { color: '#FFD700', size: 7 },
};

function getCategoryStyle(category: string): { color: Cesium.Color; size: number } {
  const style = CATEGORY_STYLES[category] || { color: '#FFFFFF', size: 6 };
  return {
    color: Cesium.Color.fromCssColorString(style.color).withAlpha(0.85),
    size: style.size,
  };
}

export class EonetLayer {
  private viewer: Cesium.Viewer;
  private entities: Map<string, Cesium.Entity> = new Map();
  private intervalId: number | null = null;
  private onCountUpdate: ((count: number) => void) | null = null;
  private authenticated = false;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  setAuthenticated(authenticated: boolean) {
    this.authenticated = authenticated;
  }

  async start() {
    await this.poll();
    const interval = this.authenticated ? 600_000 : 1_800_000; // 10 min auth, 30 min anon
    this.intervalId = window.setInterval(() => this.poll(), interval);
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.clearAll();
  }

  private async poll() {
    try {
      const events = await fetchEonetEvents();
      this.updateEntities(events);
    } catch (e) {
      console.error('EONET poll failed:', e);
    }
  }

  private updateEntities(events: EonetEvent[]) {
    this.clearAll();

    const capped = !this.authenticated && events.length > 50 ? events.slice(0, 50) : events;

    for (const ev of capped) {
      const id = `eonet-${ev.id}`;
      const style = getCategoryStyle(ev.category);

      const entity = this.viewer.entities.add({
        id,
        name: ev.title,
        position: Cesium.Cartesian3.fromDegrees(ev.longitude, ev.latitude, 0),
        point: {
          pixelSize: style.size,
          color: style.color,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      (entity as any)._entityType = 'eonetEvent';
      (entity as any)._eonetData = ev;
      this.entities.set(id, entity);
    }

    this.onCountUpdate?.(this.entities.size);
    this.viewer.scene.requestRender();
  }

  private clearAll() {
    for (const [, entity] of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}

