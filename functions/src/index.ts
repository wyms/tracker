import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
admin.initializeApp();
const db = admin.firestore();

const OPENSKY_CLIENT_ID = defineSecret("OPENSKY_CLIENT_ID");
const OPENSKY_CLIENT_SECRET = defineSecret("OPENSKY_CLIENT_SECRET");
const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");

const ADMIN_EMAIL = "kvagol1@gmail.com";

const app = express();
// Cloud Run sits behind Google's load balancer; trust one hop so req.ip
// reflects the real client IP from X-Forwarded-For, not the LB's IP.
app.set('trust proxy', 1);
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

// --- Firebase Auth middleware ---
// Extracts and verifies Firebase ID token from Authorization header.
// Does NOT reject unauthenticated requests — just sets req._fbUser if valid.

interface AuthenticatedRequest extends express.Request {
  _fbUser?: admin.auth.DecodedIdToken;
}

app.use(async (req: AuthenticatedRequest, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7);
    try {
      req._fbUser = await admin.auth().verifyIdToken(idToken);
    } catch {
      // Invalid token — treat as anonymous
    }
  }
  next();
});

// --- Rate limiting ---
// In-memory sliding window per IP. Anon: 30 req/min. Auth: 120 req/min.

const ANON_RATE_LIMIT = 30;
const AUTH_RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Clean stale buckets every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 120_000);

app.use((req: AuthenticatedRequest, res, next) => {
  // Skip rate limiting for the sign-in endpoint and usage endpoint
  if (req.path === '/api/auth/signin' || req.path === '/api/usage') {
    next();
    return;
  }

  // req.ip is correct after `trust proxy 1`; fall back to first XFF entry
  const xffRaw = req.headers['x-forwarded-for'] as string | undefined;
  const ip = req.ip || (xffRaw ? xffRaw.split(',')[0].trim() : 'unknown');
  const isAuth = !!req._fbUser;
  const limit = isAuth ? AUTH_RATE_LIMIT : ANON_RATE_LIMIT;
  const now = Date.now();

  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count++;

  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter,
      authenticated: isAuth,
      limit,
    });
    return;
  }

  next();
});

// --- Email notification helper ---

async function sendNotificationEmail(subject: string, body: string) {
  try {
    // SMTP_PASSWORD is optional — if not configured, skip email silently
    const smtpPass = SMTP_PASSWORD.value() || process.env.SMTP_PASSWORD || '';
    if (!smtpPass) {
      console.log('SMTP_PASSWORD not configured, skipping email notification');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: ADMIN_EMAIL,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"Tracker" <${ADMIN_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject,
      text: body,
    });
  } catch (err) {
    console.error('Failed to send notification email:', err);
  }
}

// --- User sign-in tracking ---

app.post("/api/auth/signin", express.json(), async (req: AuthenticatedRequest, res) => {
  if (!req._fbUser) {
    res.status(401).json({ error: 'Invalid or missing authentication token' });
    return;
  }

  const { uid, email, name, picture } = req._fbUser;
  const now = Date.now();

  try {
    const userRef = db.doc(`users/${uid}`);
    const existing = await userRef.get();
    const isNewUser = !existing.exists;

    await userRef.set({
      uid,
      email: email || null,
      displayName: name || null,
      photoURL: picture || null,
      lastSignIn: now,
      signInCount: admin.firestore.FieldValue.increment(1),
      ...(isNewUser ? { firstSignIn: now } : {}),
    }, { merge: true });

    // Email notification for new users
    if (isNewUser) {
      const emailBody = [
        `New user signed in to Geospatial Command Center`,
        ``,
        `Email: ${email || 'N/A'}`,
        `Name: ${name || 'N/A'}`,
        `UID: ${uid}`,
        `Time: ${new Date(now).toISOString()}`,
      ].join('\n');

      void sendNotificationEmail(`New User: ${email || name || uid}`, emailBody);
    }

    res.json({ ok: true, isNewUser });
  } catch (err) {
    console.error('Failed to track user sign-in:', err);
    res.status(500).json({ error: 'Failed to record sign-in' });
  }
});

// --- Users list endpoint (admin) ---

app.get("/api/users", async (req: AuthenticatedRequest, res) => {
  if (!req._fbUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  // Restrict to admin only
  if (req._fbUser.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const snapshot = await db.collection('users')
      .orderBy('lastSignIn', 'desc')
      .limit(100)
      .get();
    const users = snapshot.docs.map(d => d.data());
    res.json(users);
  } catch (err) {
    console.error('Failed to read users:', err);
    res.status(500).json({ error: 'Failed to read users' });
  }
});

// --- OpenSky circuit breaker ---
// If OpenSky has failed recently, skip it entirely to avoid blocking other routes.
let openSkyCircuitOpen = false;
let openSkyCircuitResetAt = 0;
const CIRCUIT_COOLDOWN_MS = 120_000; // 2 minutes

function openSkyAvailable(): boolean {
  if (!openSkyCircuitOpen) return true;
  if (Date.now() > openSkyCircuitResetAt) {
    openSkyCircuitOpen = false;
    return true;
  }
  return false;
}

function tripOpenSkyCircuit() {
  openSkyCircuitOpen = true;
  openSkyCircuitResetAt = Date.now() + CIRCUIT_COOLDOWN_MS;
  console.warn("OpenSky circuit breaker tripped — skipping OpenSky requests for 2 minutes");
}

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
    const tokenTimeout = setTimeout(() => tokenController.abort(), 8_000);
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
const SYNC_INTERVAL = 300_000; // 5 min — reduces Firestore writes during active use

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
        const safePath = new URL(url).pathname;
        console.warn(`Upstream ${res.status} for ${safePath}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
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
        const safePath = (() => { try { return new URL(url).pathname; } catch { return '[invalid-url]'; } })();
        console.warn(`Fetch error for ${safePath}, retrying in ${delay}ms:`, err);
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
    const safePath = (() => { try { return new URL(targetUrl).pathname; } catch { return '[invalid-url]'; } })();
    console.error(`Proxy error for ${safePath}:`, err);
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
  // Circuit breaker: if OpenSky has been failing, return 503 immediately
  if (!openSkyAvailable()) {
    res.status(503).json({ error: "OpenSky temporarily unavailable" });
    return;
  }

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

  try {
    await cachedProxyRequest(targetUrl, req, res, headers, getAdaptiveCacheTtl());
  } catch {
    tripOpenSkyCircuit();
    if (!res.headersSent) {
      res.status(502).json({ error: "OpenSky upstream failed" });
    }
  }
});

// CelesTrak (no auth, cached)
app.get("/api/celestrak/*", async (req, res) => {
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
app.get("/api/usgs/*", async (req, res) => {
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
app.get("/api/austin/*", async (req, res) => {
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
app.get("/api/adsb/*", async (req, res) => {
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
app.get("/api/firms/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/firms/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://firms.modaps.eosdis.nasa.gov${path}${qs}`;
  if (!validateProxyTarget(targetUrl, "https://firms.modaps.eosdis.nasa.gov")) {
    res.status(400).json({ error: "Invalid proxy target" });
    return;
  }
  await cachedProxyRequest(targetUrl, req, res, {}, 3_600_000); // 1 hour cache — FIRMS updates ~3h
});

// FAA NASSTATUS (no auth, cached 2 min — data updates slowly)
app.get("/api/faa/*", async (req, res) => {
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

const DEFAULT_TRACKED_CALLSIGNS = ["N307EL", "N308EL", "N309EL"];
// ICAO24 hex codes matching the default callsigns — used to query only these aircraft
// instead of downloading the full global state vector.
const DEFAULT_TRACKED_ICAO24S = ["a339c2", "a33d79", "a34130"];

async function getTrackedAircraft(): Promise<{ callsigns: string[]; icao24s: string[] }> {
  try {
    const doc = await db.doc("config/tracked-aircraft").get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data?.callsigns) && data.callsigns.length > 0) {
        return {
          callsigns: data.callsigns,
          icao24s: Array.isArray(data?.icao24s) ? data.icao24s : DEFAULT_TRACKED_ICAO24S,
        };
      }
    }
  } catch (err) {
    console.error("Failed to load tracked aircraft from Firestore:", err);
  }
  return { callsigns: DEFAULT_TRACKED_CALLSIGNS, icao24s: DEFAULT_TRACKED_ICAO24S };
}

app.get("/api/tracked-flights", async (req: AuthenticatedRequest, res) => {
  if (!req._fbUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
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
    schedule: "every 2 hours",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET],
  },
  async () => {
    const { callsigns: TRACKED_CALLSIGNS, icao24s: TRACKED_ICAO24S } = await getTrackedAircraft();
    console.log("trackFlights: polling OpenSky for", TRACKED_CALLSIGNS.join(", "));

    // Query only the specific ICAO24s instead of the full global state vector (~10MB).
    // This reduces each run from ~10MB download to a few hundred bytes.
    const icao24Params = TRACKED_ICAO24S.map((id) => `icao24=${id}`).join("&");
    let states: any[][] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await globalThis.fetch(
        `https://opensky-network.org/api/states/all?${icao24Params}`,
        { signal: controller.signal },
      );
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
