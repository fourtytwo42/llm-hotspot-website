# Multi-Tenant Endpoint Routing (Cloudflare + Next.js)

## Goal

Issue each paid customer a unique endpoint URL and route all traffic through the single Cloudflare tunnel already targeting this app (`localhost:3000`).

Example tenant endpoint:

- `https://acme.llmhotspot.com/v1/chat/completions`

## Architecture

1. DNS and tunnel stay centralized on your account.
2. Each customer gets a unique subdomain slug (`acme`, `team42`, etc).
3. Incoming request host determines tenant (`acme.llmhotspot.com` -> `acme`).
4. App resolves the tenant and active connector session.
5. App forwards `/v1/*` traffic to the managed relay service.
6. Relay forwards to the tenant's live desktop connector.

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
2. `POST /api/connectors/issue`
   - Body: `{ "licenseKey": "...", "deviceId": "...", "endpointSlug": "acme" }`
   - Issues connector credentials for desktop daemon outbound `wss` connection.
3. `POST /api/connectors/heartbeat`
   - Relay uses this to mark connector online/offline and capacity.
4. `GET /api/connectors/status?slug=acme`
   - Returns connector online state for tenant.
5. `POST /api/connectors/verify`
   - Relay-internal connector token verification endpoint.
6. `POST /api/endpoints/details`
   - Body: `{ "licenseKey": "...", "deviceId": "..." }`
   - Returns current endpoint + relay status for a license.
7. `POST /api/endpoints/token/rotate`
   - Body: `{ "licenseKey": "...", "deviceId": "..." }`
   - Rotates endpoint token and returns a new one-time token.
8. `GET /api/endpoints/health`
   - Call using tenant host, e.g. `https://acme.xclaw.trade/api/endpoints/health`.
   - Verifies host-to-tenant resolution and connector status.
9. `/v1/*` proxy route
   - Resolves tenant from host subdomain.
   - Public client `Authorization: Bearer <hotspot_access_key>` passes through.
   - Forwards to managed relay (`RELAY_HTTP_BASE`) for connector dispatch.
   - Includes per-tenant per-IP rate limiting.

## Desktop runtime integration

`llmhotspot-v2` can use this website as assignment source without extra backend routes:

1. Call `POST /api/endpoints/details` with:
   - `{ "licenseKey": "...", "deviceId": "..." }`
2. If response contains `endpoint.publicBaseUrl`, derive:
   - `remote_base_url = endpoint.publicBaseUrl`
   - `remote_console_url = endpoint.publicBaseUrl + "/endpoints"`

This keeps remote endpoint and remote console on the same tenant origin.

## Environment variable

Add:

- `ENDPOINTS_BASE_DOMAIN=llmhotspot.com`
- `PROXY_RATE_LIMIT_WINDOW_MS=60000`
- `PROXY_RATE_LIMIT_MAX=120`
- `RELAY_HTTP_BASE=http://localhost:8789`
- `RELAY_WS_URL=ws://localhost:8789/ws/connect`
- `RELAY_CONNECTOR_SIGNING_SECRET=...`
- `RELAY_CONNECTOR_TTL_SECONDS=604800`
- `RELAY_INTERNAL_SECRET=...`

## Notes

- Current storage is `data/store.json` (prototype only). Move to Postgres before production scale.
- Add rate limiting and abuse controls before opening publicly.
- Add per-tenant usage metering and logs.
- Managed relay service lives in `relay/` and is the public data plane.
