import * as Cesium from 'cesium';

const ARTEMIS_COLOR = Cesium.Color.fromCssColorString('#FF8C00');
const PATH_COLOR = Cesium.Color.fromCssColorString('#FF8C00').withAlpha(0.4);
const TRAVELED_COLOR = Cesium.Color.fromCssColorString('#FF8C00').withAlpha(0.8);

// Artemis II mission timeline
const LAUNCH_ISO = '2026-04-01T18:35:00Z';
const TLI_HOURS = 2;       // Trans-Lunar Injection at T+2h
const FLYBY_HOURS = 96;    // Lunar closest approach at T+~4 days
const RETURN_HOURS = 240;  // Earth return at T+~10 days

const EARTH_RADIUS_KM = 6371;
const LEO_ALTITUDE_KM = 185;
const MOON_DISTANCE_KM = 384400;
const FLYBY_BEYOND_KM = 6400; // ~6400 miles beyond far side per NASA spec → ~10300 km

// Smooth interpolation (ease in-out)
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export class ArtemisLayer {
  private viewer: Cesium.Viewer;
  private craftEntity: Cesium.Entity | null = null;
  private labelEntity: Cesium.Entity | null = null;
  private pathEntity: Cesium.Entity | null = null;
  private traveledEntity: Cesium.Entity | null = null;
  private earthMarker: Cesium.Entity | null = null;
  private moonMarker: Cesium.Entity | null = null;
  private updateIntervalId: number | null = null;
  private loaded = false;
  private onCountUpdate: ((count: number) => void) | null = null;
  private moonWasEnabled = false;
  private trajectoryPoints: { hour: number; position: Cesium.Cartesian3 }[] = [];
  private launchJd: Cesium.JulianDate;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.launchJd = Cesium.JulianDate.fromIso8601(LAUNCH_ISO);
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  async start() {
    if (!this.loaded) {
      this.loadTrajectory();
      this.loaded = true;
    }
    this.updatePosition();
    this.updateIntervalId = window.setInterval(() => this.updatePosition(), 5000);
  }

  stop() {
    if (this.updateIntervalId !== null) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.clearAll();
    this.loaded = false;
  }

  private getMoonPositionEci(julianDate: Cesium.JulianDate): Cesium.Cartesian3 {
    // Use CesiumJS built-in lunar ephemeris
    try {
      return (Cesium as any).Simon1994PlanetaryPositions
        .computeMoonPositionInEarthInertialFrame(julianDate);
    } catch {
      // Fallback: approximate position
      return new Cesium.Cartesian3(MOON_DISTANCE_KM * 1000, 0, 0);
    }
  }

  private loadTrajectory() {
    // Compute Moon position at flyby time
    const flybyJd = Cesium.JulianDate.addHours(this.launchJd, FLYBY_HOURS, new Cesium.JulianDate());
    const moonEci = this.getMoonPositionEci(flybyJd);

    // Moon direction and perpendicular vectors
    const moonDir = Cesium.Cartesian3.normalize(moonEci, new Cesium.Cartesian3());
    // Perpendicular in orbital plane (cross with Z axis)
    const zAxis = new Cesium.Cartesian3(0, 0, 1);
    const perpDir = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(moonDir, zAxis, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    const moonDist = Cesium.Cartesian3.magnitude(moonEci); // meters
    const leoRadius = (EARTH_RADIUS_KM + LEO_ALTITUDE_KM) * 1000; // meters
    const apogee = moonDist + FLYBY_BEYOND_KM * 1000; // meters past Moon

    // Generate trajectory waypoints every 30 minutes
    this.trajectoryPoints = [];
    const totalHours = RETURN_HOURS;
    const dt = 0.5; // hours

    for (let h = TLI_HOURS; h <= totalHours; h += dt) {
      let pos: Cesium.Cartesian3;

      if (h <= FLYBY_HOURS) {
        // Outbound coast: Earth to Moon
        const frac = (h - TLI_HOURS) / (FLYBY_HOURS - TLI_HOURS);
        const easedFrac = Math.pow(frac, 0.55); // gravity deceleration
        const radial = leoRadius + (apogee - leoRadius) * easedFrac;
        // Lateral curve for visual effect (peaks mid-flight)
        const lateral = -moonDist * 0.08 * Math.sin(frac * Math.PI);

        pos = new Cesium.Cartesian3(
          moonDir.x * radial + perpDir.x * lateral,
          moonDir.y * radial + perpDir.y * lateral,
          moonDir.z * radial + perpDir.z * lateral,
        );
      } else {
        // Return coast: Moon back to Earth
        const frac = (h - FLYBY_HOURS) / (RETURN_HOURS - FLYBY_HOURS);
        const easedFrac = Math.pow(frac, 1.8); // gravity acceleration on return
        const radial = apogee - (apogee - leoRadius) * easedFrac;
        // Lateral curve on opposite side for figure-8 shape
        const lateral = moonDist * 0.08 * Math.sin(frac * Math.PI);

        pos = new Cesium.Cartesian3(
          moonDir.x * radial + perpDir.x * lateral,
          moonDir.y * radial + perpDir.y * lateral,
          moonDir.z * radial + perpDir.z * lateral,
        );
      }

      this.trajectoryPoints.push({ hour: h, position: pos });
    }

    // Draw the full planned trajectory path
    const allPositions = this.trajectoryPoints.map((p) => p.position);
    this.pathEntity = this.viewer.entities.add({
      id: 'artemis-path',
      polyline: {
        positions: allPositions,
        width: 1.5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.1,
          color: PATH_COLOR,
        }),
      },
    });

    // Spacecraft entity
    this.craftEntity = this.viewer.entities.add({
      id: 'artemis-orion',
      position: Cesium.Cartesian3.ZERO,
      point: {
        pixelSize: 12,
        color: ARTEMIS_COLOR,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: false,
    });
    (this.craftEntity as any)._entityType = 'artemis';
    (this.craftEntity as any)._artemisData = {
      OBJECT_NAME: 'ORION (ARTEMIS II)',
      mission: 'Artemis II',
      vehicle: 'Orion MPCV',
    };

    // Label
    this.labelEntity = this.viewer.entities.add({
      id: 'artemis-label',
      position: Cesium.Cartesian3.ZERO,
      label: {
        text: 'ORION — Artemis II',
        font: '13px monospace',
        fillColor: ARTEMIS_COLOR,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(18, -5),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: false,
    });

    // Moon label marker at flyby point
    this.moonMarker = this.viewer.entities.add({
      id: 'artemis-moon-marker',
      position: moonEci,
      point: {
        pixelSize: 8,
        color: Cesium.Color.LIGHTGRAY,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'Moon',
        font: '11px monospace',
        fillColor: Cesium.Color.LIGHTGRAY,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -5),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Earth label
    this.earthMarker = this.viewer.entities.add({
      id: 'artemis-earth-marker',
      position: new Cesium.Cartesian3(0, 0, (EARTH_RADIUS_KM + 500) * 1000),
      label: {
        text: 'Earth',
        font: '11px monospace',
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Enable Moon rendering
    this.moonWasEnabled = !!this.viewer.scene.moon;
    if (!this.viewer.scene.moon) {
      this.viewer.scene.moon = new Cesium.Moon();
    }

    this.onCountUpdate?.(1);
  }

  private getMissionHour(): number {
    const now = Cesium.JulianDate.now();
    return Cesium.JulianDate.secondsDifference(now, this.launchJd) / 3600;
  }

  private interpolatePosition(hour: number): Cesium.Cartesian3 | null {
    if (this.trajectoryPoints.length === 0) return null;

    // Clamp to trajectory range
    const clampedHour = Math.max(
      this.trajectoryPoints[0].hour,
      Math.min(hour, this.trajectoryPoints[this.trajectoryPoints.length - 1].hour)
    );

    // Find bracketing waypoints
    for (let i = 0; i < this.trajectoryPoints.length - 1; i++) {
      const a = this.trajectoryPoints[i];
      const b = this.trajectoryPoints[i + 1];
      if (clampedHour >= a.hour && clampedHour <= b.hour) {
        const frac = (clampedHour - a.hour) / (b.hour - a.hour);
        return Cesium.Cartesian3.lerp(a.position, b.position, frac, new Cesium.Cartesian3());
      }
    }
    return this.trajectoryPoints[this.trajectoryPoints.length - 1].position;
  }

  private updatePosition() {
    if (!this.craftEntity || !this.labelEntity) return;

    const hour = this.getMissionHour();
    const pos = this.interpolatePosition(hour);

    if (!pos) {
      this.craftEntity.show = false;
      this.labelEntity.show = false;
      return;
    }

    this.craftEntity.position = new Cesium.ConstantPositionProperty(pos);
    this.craftEntity.show = true;
    this.labelEntity.position = new Cesium.ConstantPositionProperty(pos);
    this.labelEntity.show = true;

    // Update traveled path (from TLI to current position)
    if (this.traveledEntity) {
      this.viewer.entities.remove(this.traveledEntity);
    }
    const traveledPositions = this.trajectoryPoints
      .filter((p) => p.hour <= hour)
      .map((p) => p.position);
    if (traveledPositions.length > 1) {
      traveledPositions.push(pos);
      this.traveledEntity = this.viewer.entities.add({
        id: 'artemis-traveled',
        polyline: {
          positions: traveledPositions,
          width: 2.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: TRAVELED_COLOR,
          }),
        },
      });
    }

    this.viewer.scene.requestRender();
  }

  /** Fly camera out to show the full Earth-Moon trajectory */
  flyTo() {
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 500_000_000),
      duration: 2,
    });
  }

  /** Get current position info as a readable string */
  getPositionString(): string | null {
    const hour = this.getMissionHour();
    const pos = this.interpolatePosition(hour);
    if (!pos) return null;
    const distKm = Cesium.Cartesian3.magnitude(pos) / 1000 - EARTH_RADIUS_KM;
    const phase = hour < FLYBY_HOURS ? 'Outbound' : 'Return';
    return `${phase} · ${Math.round(distKm).toLocaleString()} km from Earth · T+${hour.toFixed(1)}h`;
  }

  isUsingFallback(): boolean {
    return false;
  }

  private clearAll() {
    const ents = [this.craftEntity, this.labelEntity, this.pathEntity,
      this.traveledEntity, this.earthMarker, this.moonMarker];
    for (const e of ents) {
      if (e) this.viewer.entities.remove(e);
    }
    this.craftEntity = null;
    this.labelEntity = null;
    this.pathEntity = null;
    this.traveledEntity = null;
    this.earthMarker = null;
    this.moonMarker = null;

    // Restore Moon state
    if (!this.moonWasEnabled && this.viewer.scene.moon) {
      this.viewer.scene.moon = undefined as any;
    }

    this.trajectoryPoints = [];
  }
}
