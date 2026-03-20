import * as Cesium from 'cesium';
import { fetchFireHotspots, type FireHotspot } from '../services/firms';

function frpToColor(frp: number): Cesium.Color {
  if (frp < 10) return Cesium.Color.YELLOW.withAlpha(0.8);
  if (frp < 50) return Cesium.Color.ORANGE.withAlpha(0.85);
  if (frp < 200) return Cesium.Color.fromCssColorString('#FF4500').withAlpha(0.9);
  return Cesium.Color.RED.withAlpha(0.95);
}

function frpToSize(frp: number): number {
  if (frp < 10) return 4;
  if (frp < 50) return 6;
  if (frp < 200) return 8;
  return 11;
}

export class FireLayer {
  private viewer: Cesium.Viewer;
  private pointCollection: Cesium.PointPrimitiveCollection | null = null;
  private intervalId: number | null = null;
  private onCountUpdate: ((count: number) => void) | null = null;
  private onDataUpdate: ((hotspots: FireHotspot[]) => void) | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  setOnDataUpdate(cb: (hotspots: FireHotspot[]) => void) {
    this.onDataUpdate = cb;
  }

  async start() {
    if (!this.pointCollection) {
      this.pointCollection = this.viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection()
      );
    }
    await this.poll();
    // Re-fetch every 10 minutes (FIRMS updates ~every 3 hours, but we poll more often
    // so newly toggled-on layers get data promptly)
    this.intervalId = window.setInterval(() => this.poll(), 600_000);
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
      const hotspots = await fetchFireHotspots();
      this.updatePoints(hotspots);
    } catch (e) {
      console.error('Fire data poll failed:', e);
    }
  }

  private updatePoints(hotspots: FireHotspot[]) {
    if (!this.pointCollection) return;
    this.pointCollection.removeAll();

    for (const h of hotspots) {
      const point = this.pointCollection.add({
        position: Cesium.Cartesian3.fromDegrees(h.longitude, h.latitude, 0),
        pixelSize: frpToSize(h.frp),
        color: frpToColor(h.frp),
      });
      (point as any)._fireData = h;
    }

    this.onCountUpdate?.(hotspots.length);
    this.onDataUpdate?.(hotspots);
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
