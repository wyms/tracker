import * as Cesium from 'cesium';
import { fetchRadiationReadings, type RadiationReading } from '../services/safecast';

// CPM (counts per minute) coloring based on radiation levels
// Normal background: ~30-50 CPM, elevated: 100+, concerning: 300+
function cpmToColor(cpm: number): Cesium.Color {
  if (cpm < 50) return Cesium.Color.fromCssColorString('#00FF88').withAlpha(0.6);
  if (cpm < 100) return Cesium.Color.YELLOW.withAlpha(0.7);
  if (cpm < 300) return Cesium.Color.ORANGE.withAlpha(0.8);
  if (cpm < 1000) return Cesium.Color.RED.withAlpha(0.85);
  return Cesium.Color.fromCssColorString('#FF00FF').withAlpha(0.9);
}

function cpmToSize(cpm: number): number {
  if (cpm < 50) return 3;
  if (cpm < 100) return 5;
  if (cpm < 300) return 7;
  return 9;
}

export class RadiationLayer {
  private viewer: Cesium.Viewer;
  private pointCollection: Cesium.PointPrimitiveCollection | null = null;
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
    if (!this.pointCollection) {
      this.pointCollection = this.viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );
    }
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
      const readings = await fetchRadiationReadings();
      this.updatePoints(readings);
    } catch (e) {
      console.error('Radiation data poll failed:', e);
    }
  }

  private updatePoints(readings: RadiationReading[]) {
    if (!this.pointCollection) return;
    this.pointCollection.removeAll();

    const capped = !this.authenticated && readings.length > 50 ? readings.slice(0, 50) : readings;

    for (const r of capped) {
      const point = this.pointCollection.add({
        position: Cesium.Cartesian3.fromDegrees(r.longitude, r.latitude, 0),
        pixelSize: cpmToSize(r.value),
        color: cpmToColor(r.value),
      });
      (point as any)._radiationData = r;
    }

    this.onCountUpdate?.(capped.length);
    this.viewer.scene.requestRender();
  }

  private clearAll() {
    if (this.pointCollection) {
      this.viewer.scene.primitives.remove(this.pointCollection);
      this.pointCollection = null;
    }
    this.onCountUpdate?.(0);
  }
}
