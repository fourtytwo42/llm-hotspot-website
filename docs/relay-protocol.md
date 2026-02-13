# Relay Connector Protocol v1

This protocol is used between the managed relay service and desktop hotspot daemon connectors.

## Transport

- Connector opens `wss://<relay>/ws/connect`
- Header: `Authorization: Bearer <connectorToken>`

## Frames

All frames are JSON objects.

### Request from relay to connector

```json
{
  "type": "request_open",
  "request_id": "relay_abc123",
  "tenant_slug": "demo001",
  "method": "POST",
  "path": "/v1/chat/completions",
  "headers": {
    "authorization": "Bearer ohs_...",
    "content-type": "application/json"
  },
  "body_base64": "eyJtb2RlbCI6Ii4uLiJ9",
  "stream": false
}
```

### Connector success response

```json
{
  "type": "response_end",
  "request_id": "relay_abc123",
  "status": 200,
  "headers": {
    "content-type": "application/json"
  },
  "body_base64": "eyJpZCI6Ii4uLiJ9"
}
```

### Connector error response

```json
{
  "type": "error",
  "request_id": "relay_abc123",
  "message": "upstream_failed"
}
```

### Keepalive

- Relay may send `{ "type": "ping" }`
- Connector should reply `{ "type": "pong" }`

## Auth model

- Public clients send hotspot access key in `Authorization` header.
- Relay passes that header through to connector.
- Connector validates key using hotspot key store.
