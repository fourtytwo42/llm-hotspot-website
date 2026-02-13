# LLM Hotspot Managed Relay

Managed data plane for public SSL endpoint routing.

## Endpoints

- `GET /health`
- `WS /ws/connect` (desktop connector)
- `GET|POST /v1/*` (public client traffic)

## Environment

- `PORT` default `8789`
- `CONTROL_PLANE_BASE` default `http://localhost:3000`
- `ENDPOINTS_BASE_DOMAIN` default `llmhotspot.com`
- `RELAY_INTERNAL_SECRET` optional shared secret for control-plane internal APIs
- `RELAY_REQUEST_TIMEOUT_MS` default `30000`
- `RELAY_CONNECTOR_HEARTBEAT_MS` default `15000`

## Run

```bash
npm install
npm start
```
