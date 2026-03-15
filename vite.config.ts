import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import tailwindcss from '@tailwindcss/vite'

/**
 * Vite plugin that proxies /api/opensky requests with OAuth2 Bearer tokens.
 * Mirrors the auth logic in functions/src/index.ts for local development.
 */
function openSkyAuthProxy(): Plugin {
  let clientId = ''
  let clientSecret = ''
  let cachedToken: { token: string; expiresAt: number } | null = null

  async function getToken(): Promise<string | null> {
    if (!clientId || !clientSecret) return null
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
      return cachedToken.token
    }

    try {
      const res = await fetch(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }),
        },
      )

      if (!res.ok) {
        console.error('OpenSky token request failed:', res.status)
        return null
      }

      const data = (await res.json()) as { access_token: string; expires_in: number }
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }
      return cachedToken.token
    } catch (err) {
      console.error('Failed to get OpenSky token:', err)
      return null
    }
  }

  return {
    name: 'opensky-auth-proxy',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), 'VITE_')
      clientId = env.VITE_OPENSKY_CLIENT_ID ?? ''
      clientSecret = env.VITE_OPENSKY_CLIENT_SECRET ?? ''

      if (!clientId || !clientSecret) {
        console.warn(
          '[opensky-auth-proxy] VITE_OPENSKY_CLIENT_ID / VITE_OPENSKY_CLIENT_SECRET not set — requests will be unauthenticated',
        )
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/opensky')) return next()

        const path = req.url.replace(/^\/api\/opensky/, '/api')
        const targetUrl = `https://opensky-network.org${path}`

        try {
          const headers: Record<string, string> = {}
          const token = await getToken()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }

          const upstream = await fetch(targetUrl, { headers })
          const contentType = upstream.headers.get('content-type')

          res.statusCode = upstream.status
          if (contentType) res.setHeader('Content-Type', contentType)

          const body = Buffer.from(await upstream.arrayBuffer())
          res.end(body)
        } catch (err) {
          console.error('OpenSky proxy error:', err)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Upstream request failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), cesium(), tailwindcss(), openSkyAuthProxy()],
  server: {
    host: true,
    proxy: {
      '/api/celestrak': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/celestrak/, ''),
      },
      '/api/usgs': {
        target: 'https://earthquake.usgs.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/usgs/, ''),
      },
      '/api/austin': {
        target: 'https://data.austintexas.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/austin/, ''),
      },
      '/api/weather': {
        target: 'https://mesonet.agron.iastate.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, ''),
      },
      '/api/faa': {
        target: 'https://nasstatus.faa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/faa/, ''),
      },
    },
  },
})
