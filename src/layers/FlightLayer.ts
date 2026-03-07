import * as Cesium from 'cesium';
import type { AircraftState } from '../services/opensky';
import { fetchFlights, type BoundingBox } from '../services/opensky';

const STALE_THRESHOLD = 60_000; // 60 seconds
const NORMAL_SCALE = 0.4;
const HIGHLIGHTED_SCALE = 1.2;
const MAX_TRAIL_POINTS = 20;
const AUTH_POLL_INTERVAL = 15_000; // 15s for authenticated users
const ANON_POLL_INTERVAL = 30_000; // 30s for anonymous users
const MAX_POLL_INTERVAL = 120_000; // 2 minutes max backoff
const MAX_BBOX_SPAN = 20; // max degrees lat/lon span to avoid requesting the entire globe
const ANON_AIRCRAFT_CAP = 50;

interface TrailEntry {
  positions: Cesium.Cartesian3[];
  entity: Cesium.Entity | null;
}

export class FlightLayer {
  private viewer: Cesium.Viewer;
  private entities: Map<string, { entity: Cesium.Entity; lastUpdate: number }> = new Map();
  private trails: Map<string, TrailEntry> = new Map();
  private timeoutId: number | null = null;
  private highlightedIcao24: string | null = null;
  private trailsEnabled = true;
  private onCountUpdate: ((count: number) => void) | null = null;
  private consecutiveErrors = 0;
  private running = false;
  private authenticated = false;
  private bboxOverride: BoundingBox | 'world' | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  setBboxOverride(override: BoundingBox | 'world' | null) {
    this.bboxOverride = override;
    this.clearAll();
    if (this.running) {
      // Cancel pending poll and trigger an immediate one
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.consecutiveErrors = 0;
      this.poll();
    }
  }

  setOnCountUpdate(cb: (count: number) => void) {
    this.onCountUpdate = cb;
  }

  setTrailsEnabled(enabled: boolean) {
    this.trailsEnabled = enabled;
    if (!enabled) {
      this.clearAllTrails();
    }
    this.viewer.scene.requestRender();
  }

  setAuthenticated(authenticated: boolean) {
    this.authenticated = authenticated;
  }

  setHighlighted(icao24: string | null) {
    const prev = this.highlightedIcao24;
    this.highlightedIcao24 = icao24;

    // Reset previous highlighted entity
    if (prev) {
      const prevEntry = this.entities.get(`flight-${prev}`);
      if (prevEntry?.entity.billboard) {
        prevEntry.entity.billboard.scale = new Cesium.ConstantProperty(NORMAL_SCALE);
        prevEntry.entity.billboard.color = new Cesium.ConstantProperty(Cesium.Color.CYAN);
      }
    }

    // Highlight new entity
    if (icao24) {
      const entry = this.entities.get(`flight-${icao24}`);
      if (entry?.entity.billboard) {
        entry.entity.billboard.scale = new Cesium.ConstantProperty(HIGHLIGHTED_SCALE);
        entry.entity.billboard.color = new Cesium.ConstantProperty(Cesium.Color.YELLOW);
      }
    }

    this.viewer.scene.requestRender();
  }

  start() {
    this.running = true;
    this.consecutiveErrors = 0;
    this.poll();
  }

  stop() {
    this.running = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.clearAll();
  }

  private get basePollInterval() {
    return this.authenticated ? AUTH_POLL_INTERVAL : ANON_POLL_INTERVAL;
  }

  private scheduleNextPoll() {
    if (!this.running) return;
    const delay = Math.min(
      this.basePollInterval * Math.pow(2, this.consecutiveErrors),
      MAX_POLL_INTERVAL,
    );
    this.timeoutId = window.setTimeout(() => this.poll(), delay);
  }

  private async poll() {
    if (!this.running) return;

    let bbox: BoundingBox | undefined;
    if (this.bboxOverride === 'world') {
      bbox = undefined; // fetch all
    } else if (this.bboxOverride) {
      bbox = this.bboxOverride;
    } else {
      const viewBbox = this.getViewBoundingBox();
      if (!viewBbox) {
        this.scheduleNextPoll();
        return;
      }
      bbox = viewBbox;
    }

    try {
      let aircraft = await fetchFlights(bbox);
      if (!this.authenticated && aircraft.length > ANON_AIRCRAFT_CAP) {
        aircraft = aircraft.slice(0, ANON_AIRCRAFT_CAP);
      }
      this.consecutiveErrors = 0;
      this.updateEntities(aircraft);
      this.onCountUpdate?.(this.entities.size);
    } catch (e) {
      this.consecutiveErrors++;
      console.error(
        `Flight poll failed (attempt ${this.consecutiveErrors}, next in ${Math.min(this.basePollInterval * Math.pow(2, this.consecutiveErrors), MAX_POLL_INTERVAL) / 1000}s):`,
        e,
      );
    }

    this.scheduleNextPoll();
  }

  private getViewBoundingBox(): BoundingBox | null {
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return null;

    let south = Cesium.Math.toDegrees(rect.south);
    let west = Cesium.Math.toDegrees(rect.west);
    let north = Cesium.Math.toDegrees(rect.north);
    let east = Cesium.Math.toDegrees(rect.east);

    // Clamp bbox to MAX_BBOX_SPAN degrees to avoid huge responses when zoomed out
    const latSpan = north - south;
    const lonSpan = east - west;

    if (latSpan > MAX_BBOX_SPAN || lonSpan > MAX_BBOX_SPAN) {
      // Center the clamped box on the camera target
      const carto = this.viewer.camera.positionCartographic;
      const centerLat = Cesium.Math.toDegrees(carto.latitude);
      const centerLon = Cesium.Math.toDegrees(carto.longitude);
      const halfSpan = MAX_BBOX_SPAN / 2;
      south = Math.max(centerLat - halfSpan, -90);
      north = Math.min(centerLat + halfSpan, 90);
      west = Math.max(centerLon - halfSpan, -180);
      east = Math.min(centerLon + halfSpan, 180);
    }

    return { south, west, north, east };
  }

  private updateEntities(aircraft: AircraftState[]) {
    const now = Date.now();
    const incomingIds = new Set<string>();

    for (const ac of aircraft) {
      if (ac.latitude == null || ac.longitude == null) continue;

      const id = `flight-${ac.icao24}`;
      incomingIds.add(id);

      const position = Cesium.Cartesian3.fromDegrees(
        ac.longitude,
        ac.latitude,
        ac.baro_altitude ?? 10000
      );

      const isHighlighted = ac.icao24 === this.highlightedIcao24;
      const scale = isHighlighted ? HIGHLIGHTED_SCALE : NORMAL_SCALE;
      const color = isHighlighted ? Cesium.Color.YELLOW : Cesium.Color.CYAN;

      // Update trail
      if (this.trailsEnabled) {
        this.updateTrail(id, position);
      }

      const existing = this.entities.get(id);
      if (existing) {
        existing.entity.position = new Cesium.ConstantPositionProperty(position);
        if (existing.entity.billboard) {
          existing.entity.billboard.rotation = new Cesium.ConstantProperty(
            Cesium.Math.toRadians(-(ac.true_track ?? 0))
          );
          existing.entity.billboard.scale = new Cesium.ConstantProperty(scale);
          existing.entity.billboard.color = new Cesium.ConstantProperty(color);
        }
        existing.lastUpdate = now;
        (existing.entity as any)._flightData = ac;
      } else {
        const entity = this.viewer.entities.add({
          id,
          name: ac.callsign?.trim() || ac.icao24,
          position,
          billboard: {
            image: '/icons/aircraft.svg',
            scale,
            rotation: Cesium.Math.toRadians(-(ac.true_track ?? 0)),
            color,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
        });
        (entity as any)._flightData = ac;
        (entity as any)._entityType = 'aircraft';
        this.entities.set(id, { entity, lastUpdate: now });
      }
    }

    // Remove stale
    for (const [id, entry] of this.entities) {
      if (now - entry.lastUpdate > STALE_THRESHOLD) {
        this.viewer.entities.remove(entry.entity);
        this.entities.delete(id);
        this.removeTrail(id);
      }
    }
  }

  private updateTrail(id: string, position: Cesium.Cartesian3) {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = { positions: [], entity: null };
      this.trails.set(id, trail);
    }

    trail.positions.push(position);
    if (trail.positions.length > MAX_TRAIL_POINTS) {
      trail.positions.shift();
    }

    if (trail.positions.length >= 2) {
      const trailId = `${id}-trail`;
      if (trail.entity) {
        this.viewer.entities.remove(trail.entity);
      }
      trail.entity = this.viewer.entities.add({
        id: trailId,
        polyline: {
          positions: [...trail.positions],
          width: 1.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: Cesium.Color.CYAN.withAlpha(0.4),
          }),
        },
      });
    }
  }

  private removeTrail(id: string) {
    const trail = this.trails.get(id);
    if (trail?.entity) {
      this.viewer.entities.remove(trail.entity);
    }
    this.trails.delete(id);
  }

  private clearAllTrails() {
    for (const [, trail] of this.trails) {
      if (trail.entity) {
        this.viewer.entities.remove(trail.entity);
      }
    }
    this.trails.clear();
  }

  private clearAll() {
    for (const [, entry] of this.entities) {
      this.viewer.entities.remove(entry.entity);
    }
    this.entities.clear();
    this.clearAllTrails();
  }
}
