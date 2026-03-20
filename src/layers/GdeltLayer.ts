import * as Cesium from 'cesium';
import { fetchGdeltEvents, type GdeltEvent } from '../services/gdelt';

// Tone-based coloring: negative tone = red (conflict), neutral = yellow, positive = green
function toneToColor(tone: number): Cesium.Color {
  if (tone < -5) return Cesium.Color.RED.withAlpha(0.85);
  if (tone < -2) return Cesium.Color.fromCssColorString('#FF6347').withAlpha(0.8);
  if (tone < 0) return Cesium.Color.ORANGE.withAlpha(0.75);
  if (tone < 2) return Cesium.Color.YELLOW.withAlpha(0.7);
  return Cesium.Color.fromCssColorString('#00FF88').withAlpha(0.7);
}

export class GdeltLayer {
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
      const events = await fetchGdeltEvents('conflict');
      this.updateEntities(events);
    } catch (e) {
      console.error('GDELT poll failed:', e);
    }
  }

  private updateEntities(events: GdeltEvent[]) {
    // Clear previous entities (GDELT doesn't have stable IDs across polls)
    this.clearAll();

    const capped = !this.authenticated && events.length > 50 ? events.slice(0, 50) : events;

    for (let i = 0; i < capped.length; i++) {
      const ev = capped[i];
      const id = `gdelt-${i}-${ev.latitude}-${ev.longitude}`;
      const color = toneToColor(ev.tonez);

      const entity = this.viewer.entities.add({
        id,
        position: Cesium.Cartesian3.fromDegrees(ev.longitude, ev.latitude, 0),
        point: {
          pixelSize: 6,
          color,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      (entity as any)._entityType = 'gdeltEvent';
      (entity as any)._gdeltData = ev;
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
