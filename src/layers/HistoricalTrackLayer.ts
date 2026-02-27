import * as Cesium from 'cesium';
import type { FlightTrack } from '../services/opensky';

export interface TrackDisplayOptions {
  departureAirport?: string | null;
  arrivalAirport?: string | null;
}

export class HistoricalTrackLayer {
  private viewer: Cesium.Viewer;
  private entities: Cesium.Entity[] = [];

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  showTrack(track: FlightTrack, opts?: TrackDisplayOptions) {
    this.clear();

    const validWaypoints = track.path.filter(
      (wp) => wp.latitude != null && wp.longitude != null
    );

    if (validWaypoints.length < 2) return;

    const positions = validWaypoints.map((wp) =>
      Cesium.Cartesian3.fromDegrees(
        wp.longitude!,
        wp.latitude!,
        wp.baro_altitude ?? 10000
      )
    );

    // Track polyline (cyan glow)
    const polyline = this.viewer.entities.add({
      id: 'historical-track-line',
      polyline: {
        positions,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.CYAN,
        }),
      },
    });
    this.entities.push(polyline);

    const depCode = opts?.departureAirport || null;
    const arrCode = opts?.arrivalAirport || null;

    // Departure marker (green)
    const dep = validWaypoints[0];
    const depEntity = this.viewer.entities.add({
      id: 'historical-track-dep',
      position: Cesium.Cartesian3.fromDegrees(
        dep.longitude!,
        dep.latitude!,
        dep.baro_altitude ?? 0
      ),
      point: {
        pixelSize: 12,
        color: Cesium.Color.LIME,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: depCode ? `DEP ${depCode}` : 'DEP',
        font: '13px monospace',
        fillColor: Cesium.Color.LIME,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        outlineColor: Cesium.Color.BLACK,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
      },
    });
    this.entities.push(depEntity);

    // Arrival marker (red)
    const arr = validWaypoints[validWaypoints.length - 1];
    const arrEntity = this.viewer.entities.add({
      id: 'historical-track-arr',
      position: Cesium.Cartesian3.fromDegrees(
        arr.longitude!,
        arr.latitude!,
        arr.baro_altitude ?? 0
      ),
      point: {
        pixelSize: 12,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: arrCode ? `ARR ${arrCode}` : 'ARR',
        font: '13px monospace',
        fillColor: Cesium.Color.RED,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        outlineColor: Cesium.Color.BLACK,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
      },
    });
    this.entities.push(arrEntity);

    // Fly camera to track extent
    this.viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromCartesianArray(positions),
      duration: 1.5,
    });

    this.viewer.scene.requestRender();
  }

  clear() {
    for (const entity of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities = [];
    this.viewer.scene.requestRender();
  }
}
