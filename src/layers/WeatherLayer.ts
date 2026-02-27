import * as Cesium from 'cesium';

export class WeatherLayer {
  private viewer: Cesium.Viewer;
  private imageryLayer: Cesium.ImageryLayer | null = null;
  private refreshIntervalId: number | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  start() {
    if (this.imageryLayer) return;

    // Iowa Environmental Mesonet NEXRAD composite reflectivity (WMS, free, no auth)
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi',
      layers: 'nexrad-n0q-900913',
      parameters: {
        transparent: 'true',
        format: 'image/png',
      },
      credit: 'NEXRAD via Iowa Environmental Mesonet',
    });

    this.imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);
    this.imageryLayer.alpha = 0.5;

    this.viewer.scene.requestRender();

    // Refresh radar every 5 minutes by recreating the layer
    this.refreshIntervalId = window.setInterval(() => {
      this.stop();
      this.start();
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this.refreshIntervalId !== null) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    if (this.imageryLayer) {
      this.viewer.imageryLayers.remove(this.imageryLayer, true);
      this.imageryLayer = null;
      this.viewer.scene.requestRender();
    }
  }
}
