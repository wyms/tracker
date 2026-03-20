import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
admin.initializeApp();
const db = admin.firestore();

const OPENSKY_CLIENT_ID = defineSecret("OPENSKY_CLIENT_ID");
const OPENSKY_CLIENT_SECRET = defineSecret("OPENSKY_CLIENT_SECRET");

const app = express();
const ALLOWED_ORIGINS = [
  'https://trackerofthings.web.app',
  'https://trackerofthings.firebaseapp.com',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
}));

// --- OpenSky OAuth2 token cache (server-side) ---

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOpenSkyToken(): Promise<string | null> {
  try {
    const clientId = OPENSKY_CLIENT_ID.value();
    const clientSecret = OPENSKY_CLIENT_SECRET.value();
    if (!clientId || !clientSecret) return null;

    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
      return cachedToken.token;
    }

    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => tokenController.abort(), 30_000);
    const response = await globalThis.fetch(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: tokenController.signal,
      }
    );
    clearTimeout(tokenTimeout);

    if (!response.ok) {
      console.error("OpenSky token request failed:", response.status);
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error("OpenSky token acquisition failed, continuing without auth:", err);
    return null;
  }
}

// --- Daily API call counter (hybrid: in-memory + Firestore sync) ---

const DAILY_LIMIT = 4_000;
const SYNC_INTERVAL = 60_000;

let apiCallCounter = { date: '', count: 0 };
let lastFirestoreSync = 0;

async function loadApiCounter() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const doc = await db.doc('api-metrics/opensky-daily').get();
    if (doc.exists) {
      const data = doc.data()!;
      if (data.date === today) {
        apiCallCounter = { date: today, count: data.count || 0 };
      }
    }
  } catch (err) {
    console.error('Failed to load API counter from Firestore:', err);
  }
}

async function syncApiCounter() {
  const now = Date.now();
  if (now - lastFirestoreSync < SYNC_INTERVAL) return;
  lastFirestoreSync = now;
  try {
    await db.doc('api-metrics/opensky-daily').set({
      date: apiCallCounter.date,
      count: apiCallCounter.count,
    }, { merge: true });
  } catch (err) {
    console.error('Failed to sync API counter to Firestore:', err);
  }
}

let counterLoaded = false;

function ensureCounterLoaded() {
  if (!counterLoaded) {
    counterLoaded = true;
    void loadApiCounter();
  }
}

function trackApiCall() {
  ensureCounterLoaded();
  const today = new Date().toISOString().slice(0, 10);
  if (apiCallCounter.date !== today) {
    apiCallCounter = { date: today, count: 0 };
  }
  apiCallCounter.count++;
  void syncApiCounter();
}

function getApiUsage() {
  ensureCounterLoaded();
  const today = new Date().toISOString().slice(0, 10);
  if (apiCallCounter.date !== today) {
    apiCallCounter = { date: today, count: 0 };
  }
  return {
    date: apiCallCounter.date,
    openSkyCalls: apiCallCounter.count,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - apiCallCounter.count),
  };
}

function getAdaptiveCacheTtl(): number {
  const usage = getApiUsage();
  const ratio = usage.openSkyCalls / DAILY_LIMIT;
  if (ratio >= 0.875) return 120_000;  // 87.5%+ -> 2 min cache
  if (ratio >= 0.75) return 60_000;    // 75%+ -> 1 min cache
  return 30_000;                        // normal -> 30s cache
}

// --- Response cache ---
// Caches upstream responses by URL to avoid hammering APIs when many clients
// poll the same endpoint simultaneously. OpenSky data updates ~every 10s,
// so a 30s TTL is the baseline.

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  status: number;
  contentType: string | null;
  body: Buffer;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

// Dedup in-flight requests: if the same URL is already being fetched,
// wait for that result instead of making a duplicate request.
const inFlight = new Map<string, Promise<CacheEntry>>();

function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now > entry.expiresAt) {
      responseCache.delete(key);
    }
  }
}

// --- Proxy helper with caching and retry ---

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2
): Promise<{ status: number; contentType: string | null; body: Buffer }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use globalThis.fetch (native Node fetch) for better GCP compatibility.
      // The custom undici agent causes connect timeouts on GCP networking.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await globalThis.fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // Retry on 502/503/429 (rate limit)
      if ((res.status === 502 || res.status === 503 || res.status === 429) && attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`Upstream ${res.status} for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return {
        status: res.status,
        contentType: res.headers.get("content-type"),
        body: Buffer.from(await res.arrayBuffer()),
      };
    } catch (err) {
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`Fetch error for ${url}, retrying in ${delay}ms:`, err);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  // Should not reach here, but satisfy TypeScript
  throw new Error("Exhausted retries");
}

async function cachedProxyRequest(
  targetUrl: string,
  req: express.Request,
  res: express.Response,
  extraHeaders: Record<string, string> = {},
  cacheTtl = CACHE_TTL_MS
) {
  try {
    // Check cache
    const cached = responseCache.get(targetUrl);
    if (cached && Date.now() < cached.expiresAt) {
      res.status(cached.status);
      if (cached.contentType) res.set("Content-Type", cached.contentType);
      res.set("X-Cache", "HIT");
      res.send(cached.body);
      return;
    }

    // Dedup concurrent requests for the same URL
    let pending = inFlight.get(targetUrl);
    if (!pending) {
      pending = (async () => {
        const result = await fetchWithRetry(targetUrl, extraHeaders);
        const entry: CacheEntry = {
          status: result.status,
          contentType: result.contentType,
          body: result.body,
          expiresAt: Date.now() + cacheTtl,
        };
        // Only cache successful responses
        if (result.status >= 200 && result.status < 400) {
          responseCache.set(targetUrl, entry);
        }
        return entry;
      })();
      inFlight.set(targetUrl, pending);
      pending.finally(() => inFlight.delete(targetUrl));
    }

    const entry = await pending;

    res.status(entry.status);
    if (entry.contentType) res.set("Content-Type", entry.contentType);
    res.set("X-Cache", "MISS");
    res.send(entry.body);
  } catch (err) {
    console.error(`Proxy error for ${targetUrl}:`, err);
    res.status(502).json({ error: "Upstream request failed" });
  }
}

// Periodically clean expired cache entries
setInterval(cleanCache, 30_000);

// --- URL validation helpers ---

const OPENSKY_PATH_PREFIXES = ['/api/states/', '/api/flights/', '/api/tracks/'];

function validateProxyTarget(targetUrl: string, expectedOrigin: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.origin === expectedOrigin;
  } catch {
    return false;
  }
}

// --- Routes ---

// API usage endpoint
app.get("/api/usage", (_req, res) => {
  res.json(getApiUsage());
});

// OpenSky API (authenticated + cached with adaptive TTL)
app.get("/api/opensky/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/opensky/, "/api");

  if (!OPENSKY_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    res.status(400).json({ error: "Invalid OpenSky API path" });
    return;
  }

  // Enforce daily quota
  const usage = getApiUsage();
  if (usage.remaining <= 0) {
    res.status(429).json({ error: "Daily OpenSky API limit reached", ...usage });
    return;
  }

  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://opensky-network.org${path}${qs}`;

  const headers: Record<string, string> = {};
  const token = await getOpenSkyToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Track the call (only counts cache misses via X-Cache header after response)
  const cached = responseCache.get(targetUrl);
  if (!cached || Date.now() >= cached.expiresAt) {
    trackApiCall();
  }

  await cachedProxyRequest(targetUrl, req, res, headers, getAdaptiveCacheTtl());
});

// CelesTrak (no auth, cached)
app.all("/api/celestrak/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/celestrak/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://celestrak.org${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://celestrak.org")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// USGS Earthquake (no auth, cached)
app.all("/api/usgs/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/usgs/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://earthquake.usgs.gov${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://earthquake.usgs.gov")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// Austin Open Data (no auth, cached)
app.all("/api/austin/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/austin/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://data.austintexas.gov${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://data.austintexas.gov")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// ADS-B Exchange open data (adsb.fi — no auth, cached 10s)
app.all("/api/adsb/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/adsb/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://opendata.adsb.fi${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://opendata.adsb.fi")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 10_000);
});

// NASA FIRMS fire data (no auth, cached 10 min — data updates ~3 hours)
app.all("/api/firms/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/firms/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://firms.modaps.eosdis.nasa.gov${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://firms.modaps.eosdis.nasa.gov")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 600_000);
});

// FAA NASSTATUS (no auth, cached 2 min — data updates slowly)
app.all("/api/faa/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/faa/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://nasstatus.faa.gov${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://nasstatus.faa.gov")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 120_000);
});

// --- Tracked flights API endpoint ---

const TRACKED_CALLSIGNS = ["N307EL", "N308EL", "N309EL"];

app.get("/api/tracked-flights", async (_req, res) => {
  try {
    const snapshot = await db
      .collection("tracked-flights")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(docs);
  } catch (err) {
    console.error("Failed to read tracked flights:", err);
    res.status(500).json({ error: "Failed to read tracked flights" });
  }
});

// --- Export as Gen 2 Cloud Function ---

export const api = onRequest(
  {
    region: "europe-west2",
    memory: "256MiB",
    concurrency: 80,
    timeoutSeconds: 60,
    secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET],
  },
  app
);

// --- Scheduled flight tracker ---
// Runs every 30 minutes, checks if tracked aircraft are airborne,
// and logs their state to Firestore.

export const trackFlights = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET],
  },
  async () => {
    console.log("trackFlights: polling OpenSky for", TRACKED_CALLSIGNS.join(", "));

    // /states/all works without auth — skip token to avoid timeout on auth server.
    // Use native fetch (no custom undici agent) for better GCP compatibility.
    let states: any[][] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const res = await globalThis.fetch("https://opensky-network.org/api/states/all", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json() as { states: any[][] | null };
        states = data.states ?? [];
      } else {
        console.error("trackFlights: OpenSky returned", res.status);
        return;
      }
    } catch (err) {
      console.error("trackFlights: fetch failed:", err);
      return;
    }

    const needles = new Set(TRACKED_CALLSIGNS.map((c) => c.toUpperCase()));
    const matches = states.filter((sv) => {
      const cs = (sv[1] as string | null)?.trim().toUpperCase();
      return cs && needles.has(cs);
    });

    console.log(`trackFlights: found ${matches.length} of ${TRACKED_CALLSIGNS.length} tracked aircraft airborne`);

    const batch = db.batch();
    const now = Date.now();

    for (const sv of matches) {
      const callsign = (sv[1] as string).trim();
      const interval = Math.floor(now / (30 * 60 * 1000));
      const docId = `${callsign}-${interval}`;
      const doc = db.collection("tracked-flights").doc(docId);
      batch.set(doc, {
        callsign,
        icao24: sv[0] as string,
        origin_country: sv[2] as string,
        longitude: sv[5] as number | null,
        latitude: sv[6] as number | null,
        baro_altitude: sv[7] as number | null,
        on_ground: sv[8] as boolean,
        velocity: sv[9] as number | null,
        true_track: sv[10] as number | null,
        vertical_rate: sv[11] as number | null,
        geo_altitude: sv[13] as number | null,
        timestamp: now,
      }, { merge: true });
    }

    if (matches.length > 0) {
      await batch.commit();
      console.log(`trackFlights: wrote ${matches.length} records to Firestore`);
    }
  }
);
