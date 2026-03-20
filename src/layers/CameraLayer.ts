import * as Cesium from 'cesium';
import type { AustinCamera } from '../services/cameras';
import { fetchCameras } from '../services/cameras';

export class CameraLayer {
  private viewer: Cesium.Viewer;
  private entities: Map<string, Cesium.Entity> = new Map();
  private loaded = false;
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
    if (!this.loaded) {
      await this.loadData();
      this.loaded = true;
    }
  }

  stop() {
    this.clearAll();
    this.loaded = false;
  }

  private async loadData(): Promise<number | null> {
    try {
      let cameras = await fetchCameras();
      if (!this.authenticated && cameras.length > 50) cameras = cameras.slice(0, 50);
      for (const cam of cameras) {
        const lat = parseFloat(cam.location?.latitude);
        const lon = parseFloat(cam.location?.longitude);
        if (isNaN(lat) || isNaN(lon)) continue;

        const id = `camera-${cam.camera_id}`;
        const entity = this.viewer.entities.add({
          id,
          name: cam.location_name || `Camera ${cam.camera_id}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 10),
          billboard: {
            image: '/icons/camera.svg',
            scale: 0.35,
            color: Cesium.Color.fromCssColorString('#FF6B35'),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
        });

        (entity as any)._cameraData = {
          camera_id: cam.camera_id,
          location_name: cam.location_name,
          camera_status: cam.camera_status,
          camera_mfg: cam.camera_mfg,
          comm_status: cam.comm_status,
        };
        (entity as any)._entityType = 'camera';
        this.entities.set(id, entity);
      }

      this.onCountUpdate?.(this.entities.size);
      this.viewer.scene.requestRender();
      return Date.now();
    } catch (e) {
      console.error('Camera data load failed:', e);
      return null;
    }
  }

  private clearAll() {
    for (const [, entity] of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}
