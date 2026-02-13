# Multi-Tenant Endpoint Routing (Cloudflare + Next.js)

## Goal

Issue each paid customer a unique endpoint URL and route all traffic through the single Cloudflare tunnel already targeting this app (`localhost:3000`).

Example tenant endpoint:

- `https://acme.llmhotspot.com/v1/chat/completions`

## Architecture

1. DNS and tunnel stay centralized on your account.
2. Each customer gets a unique subdomain slug (`acme`, `team42`, etc).
3. Incoming request host determines tenant (`acme.llmhotspot.com` -> `acme`).
4. App validates tenant and tenant endpoint token.
5. App proxies request to that tenant's configured upstream (`upstreamBaseUrl`).

This avoids per-customer Cloudflare tunnels and scales by host-based multi-tenancy.

## Cloudflare setup

1. Keep your existing tunnel mapped to the app on port `3000`.
2. Add wildcard DNS:
   - `*.llmhotspot.com` -> CNAME to your tunnel public hostname.
3. Ensure tunnel ingress serves wildcard hostnames to the same origin (`http://localhost:3000`).
4. Keep apex (`llmhotspot.com`) and `www` pointing to the website.

## API surface added in this repo

1. `POST /api/endpoints/register`
   - Body: `{ "licenseKey": "...", "deviceId": "...", "slug": "acme", "upstreamBaseUrl": "https://..." }`
   - Creates endpoint for a Pro/active license.
   - Returns one-time `endpointToken` and public URL.
2. `POST /api/endpoints/upstream`
   - Body: `{ "licenseKey": "...", "deviceId": "...", "upstreamBaseUrl": "https://..." }`
   - Updates tenant upstream target.
3. `POST /api/endpoints/details`
   - Body: `{ "licenseKey": "...", "deviceId": "..." }`
   - Returns current endpoint config for a license.
4. `POST /api/endpoints/token/rotate`
   - Body: `{ "licenseKey": "...", "deviceId": "..." }`
   - Rotates endpoint token and returns a new one-time token.
5. `GET /api/endpoints/health`
   - Call using tenant host, e.g. `https://acme.xclaw.trade/api/endpoints/health`.
   - Verifies host-to-tenant resolution and whether upstream is configured.
6. `/v1/*` proxy route
   - Resolves tenant from host subdomain.
   - Auth: `Authorization: Bearer <endpointToken>` or `x-endpoint-token`.
   - Forwards to tenant's `upstreamBaseUrl/v1/*`.
   - Includes per-tenant per-IP rate limiting.

## Environment variable

Add:

- `ENDPOINTS_BASE_DOMAIN=llmhotspot.com`
- `PROXY_RATE_LIMIT_WINDOW_MS=60000`
- `PROXY_RATE_LIMIT_MAX=120`

## Notes

- Current storage is `data/store.json` (prototype only). Move to Postgres before production scale.
- Add rate limiting and abuse controls before opening publicly.
- Add per-tenant usage metering and logs.
- If you later want customer-owned local daemons, add a persistent outbound connector from daemon -> your relay service. Do not require users to run Cloudflare tunnels in your account.
