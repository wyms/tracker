import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express from "express";
import cors from "cors";

const OPENSKY_CLIENT_ID = defineSecret("OPENSKY_CLIENT_ID");
const OPENSKY_CLIENT_SECRET = defineSecret("OPENSKY_CLIENT_SECRET");

const app = express();
app.use(cors({ origin: true }));

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

    const response = await fetch(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

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

// --- Response cache ---
// Caches upstream responses by URL to avoid hammering APIs when many clients
// poll the same endpoint simultaneously. OpenSky data updates ~every 10s,
// so a 15s TTL is safe.

const CACHE_TTL_MS = 15_000;

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
      const res = await fetch(url, { headers });
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

// --- Routes ---

// OpenSky API (authenticated + cached)
app.all("/api/opensky/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/opensky/, "/api");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://opensky-network.org${path}${qs}`;

  const headers: Record<string, string> = {};
  const token = await getOpenSkyToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  await cachedProxyRequest(targetUrl, req, res, headers);
});

// CelesTrak (no auth, cached)
app.all("/api/celestrak/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/celestrak/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://celestrak.org${path}${qs}`;
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// USGS Earthquake (no auth, cached)
app.all("/api/usgs/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/usgs/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://earthquake.usgs.gov${path}${qs}`;
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// Austin Open Data (no auth, cached)
app.all("/api/austin/*", async (req, res) => {
  const path = req.path.replace(/^\/api\/austin/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targetUrl = `https://data.austintexas.gov${path}${qs}`;
  await cachedProxyRequest(targetUrl, req, res, {}, 60_000);
});

// --- Export as Gen 2 Cloud Function ---

export const api = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    concurrency: 80,
    timeoutSeconds: 60,
    secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET],
  },
  app
);
