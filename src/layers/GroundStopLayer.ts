import * as Cesium from 'cesium';
import type { FAAProgram } from '../services/faa';
import { fetchFAAStatus } from '../services/faa';

const POLL_INTERVAL = 120_000; // 2 minutes

const TYPE_ICONS: Record<FAAProgram['type'], { icon: string; color: string; scale: number }> = {
  ground_stop: { icon: '/icons/ground-stop.svg', color: '#FF1744', scale: 0.6 },
  ground_delay: { icon: '/icons/ground-stop.svg', color: '#FF9100', scale: 0.5 },
  closure: { icon: '/icons/ground-stop.svg', color: '#D50000', scale: 0.55 },
  delay: { icon: '/icons/ground-stop.svg', color: '#FFAB00', scale: 0.45 },
};

export class GroundStopLayer {
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
    // 2 min for auth, 5 min for anon
    const interval = this.authenticated ? POLL_INTERVAL : 300_000;
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
      const programs = await fetchFAAStatus();
      this.updateEntities(programs);
    } catch (e) {
      console.error('FAA status poll failed:', e);
    }
  }

  private updateEntities(programs: FAAProgram[]) {
    const capped = !this.authenticated && programs.length > 50 ? programs.slice(0, 50) : programs;
    const incomingIds = new Set<string>();

    for (const prog of capped) {
      const id = `faa-${prog.airport}-${prog.type}`;
      incomingIds.add(id);

      const existing = this.entities.get(id);
      if (existing) {
        // Update custom data in case reason/detail changed
        (existing as any)._faaData = { ...prog };
        continue;
      }

      const style = TYPE_ICONS[prog.type];

      const entity = this.viewer.entities.add({
        id,
        name: `${prog.airport} – ${prog.type.replace(/_/g, ' ').toUpperCase()}`,
        position: Cesium.Cartesian3.fromDegrees(prog.lon, prog.lat, 100),
        billboard: {
          image: style.icon,
          scale: style.scale,
          color: Cesium.Color.fromCssColorString(style.color),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        },
        label: {
          text: prog.airport,
          font: '11px monospace',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 4),
          scale: 0.9,
        },
      });

      (entity as any)._faaData = { ...prog };
      (entity as any)._entityType = 'groundStop';
      this.entities.set(id, entity);
    }

    // Remove programs no longer active
    for (const [id, entity] of this.entities) {
      if (!incomingIds.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
      }
    }

    this.onCountUpdate?.(this.entities.size);
    this.viewer.scene.requestRender();
  }

  private clearAll() {
    for (const [, entity] of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
    this.onCountUpdate?.(0);
  }
}
