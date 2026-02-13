import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";

const PORT = Number.parseInt(process.env.PORT || "8789", 10);
const CONTROL_PLANE_BASE = process.env.CONTROL_PLANE_BASE || "http://localhost:3000";
const RELAY_INTERNAL_SECRET = process.env.RELAY_INTERNAL_SECRET || "";
const BASE_DOMAIN = process.env.ENDPOINTS_BASE_DOMAIN || "llmhotspot.com";
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.RELAY_REQUEST_TIMEOUT_MS || "30000", 10);
const HEARTBEAT_MS = Number.parseInt(process.env.RELAY_CONNECTOR_HEARTBEAT_MS || "15000", 10);

const connectorsBySlug = new Map();
const requestWaiters = new Map();

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function getHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function slugFromHost(host) {
  if (!host || host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;
  if (!host.endsWith(`.${BASE_DOMAIN}`)) return null;
  const sub = host.slice(0, host.length - (`.${BASE_DOMAIN}`).length);
  if (!sub || sub.includes(".")) return null;
  return sub;
}

function randomId(prefix = "req") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function copyHeaders(headersObj) {
  const out = {};
  for (const [key, value] of Object.entries(headersObj || {})) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value);
  }
  delete out.host;
  delete out["x-forwarded-host"];
  delete out["x-relay-connector-id"];
  delete out["x-tenant-slug"];
  return out;
}

async function verifyConnectorToken(connectorToken) {
  const response = await fetch(`${CONTROL_PLANE_BASE.replace(/\/+$/, "")}/api/connectors/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(RELAY_INTERNAL_SECRET ? { "x-relay-secret": RELAY_INTERNAL_SECRET } : {}),
    },
    body: JSON.stringify({ connectorToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    return { ok: false, reason: body.error || body.reason || "verify_failed" };
  }
  return body;
}

async function sendHeartbeat(connector, extra = {}) {
  const response = await fetch(
    `${CONTROL_PLANE_BASE.replace(/\/+$/, "")}/api/connectors/heartbeat`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${connector.connectorToken}`,
        ...(RELAY_INTERNAL_SECRET ? { "x-relay-secret": RELAY_INTERNAL_SECRET } : {}),
      },
      body: JSON.stringify({
        connectorId: connector.connectorId,
        status: "online",
        capacity: connector.capacity,
        activeRequests: connector.activeRequests,
        relayVersion: "relay-0.1.0",
        relayCapabilities: {
          streaming: false,
          frames: ["request_open", "response_end", "error", "ping", "pong"],
        },
        ...extra,
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`heartbeat_failed_${response.status}:${text}`);
  }
}

function registerWaiter(requestId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requestWaiters.delete(requestId);
      reject(new Error("relay_timeout"));
    }, REQUEST_TIMEOUT_MS);
    requestWaiters.set(requestId, { resolve, reject, timer });
  });
}

function settleWaiter(requestId, err, payload) {
  const waiter = requestWaiters.get(requestId);
  if (!waiter) return;
  requestWaiters.delete(requestId);
  clearTimeout(waiter.timer);
  if (err) {
    waiter.reject(err);
    return;
  }
  waiter.resolve(payload);
}

function parseConnectorMessage(connector, raw) {
  let frame;
  try {
    frame = JSON.parse(String(raw));
  } catch {
    return;
  }
  const type = String(frame.type || "");
  const requestId = String(frame.request_id || "");
  if (type === "pong") return;
  if (!requestId) return;
  if (type === "response_end") {
    settleWaiter(requestId, null, {
      status: Number(frame.status || 200),
      headers: frame.headers && typeof frame.headers === "object" ? frame.headers : {},
      bodyBase64: String(frame.body_base64 || ""),
    });
    return;
  }
  if (type === "error") {
    settleWaiter(requestId, new Error(String(frame.message || "connector_error")));
  }
}

function unregisterConnector(connector) {
  const current = connectorsBySlug.get(connector.slug);
  if (current && current.connectorId === connector.connectorId) {
    connectorsBySlug.delete(connector.slug);
  }
  if (connector.heartbeatTimer) {
    clearInterval(connector.heartbeatTimer);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

  if (url.pathname === "/health") {
    return jsonResponse(res, 200, {
      ok: true,
      service: "llmhotspot-relay",
      at: nowIso(),
      connectorsOnline: connectorsBySlug.size,
    });
  }

  if (!url.pathname.startsWith("/v1/")) {
    return jsonResponse(res, 404, { ok: false, error: "not_found" });
  }

  const host = getHost(req);
  const slug = slugFromHost(host);
  if (!slug) {
    return jsonResponse(res, 400, { ok: false, error: "tenant_host_required" });
  }

  const connector = connectorsBySlug.get(slug);
  if (!connector || connector.ws.readyState !== 1) {
    return jsonResponse(res, 503, { ok: false, error: "tenant_offline" });
  }

  const body = await readBody(req);
  const requestId = randomId("relay");
  const waitPromise = registerWaiter(requestId);

  connector.activeRequests += 1;
  const frame = {
    type: "request_open",
    request_id: requestId,
    tenant_slug: slug,
    method: String(req.method || "GET").toUpperCase(),
    path: `${url.pathname}${url.search || ""}`,
    headers: copyHeaders(req.headers),
    body_base64: body.length ? body.toString("base64") : "",
    stream: false,
  };

  try {
    connector.ws.send(JSON.stringify(frame));
    const responseFrame = await waitPromise;

    res.statusCode = Number(responseFrame.status || 200);
    for (const [key, value] of Object.entries(responseFrame.headers || {})) {
      if (key.toLowerCase() === "content-length") continue;
      res.setHeader(key, String(value));
    }
    res.setHeader("x-llmhotspot-relay", "v1");
    res.setHeader("x-llmhotspot-tenant", slug);
    res.end(responseFrame.bodyBase64 ? Buffer.from(responseFrame.bodyBase64, "base64") : Buffer.alloc(0));
  } catch (error) {
    jsonResponse(res, 502, { ok: false, error: "relay_upstream_failed", detail: String(error.message || error) });
  } finally {
    connector.activeRequests = Math.max(0, connector.activeRequests - 1);
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    if (url.pathname !== "/ws/connect") {
      socket.destroy();
      return;
    }

    const authHeader = String(req.headers.authorization || "");
    const connectorToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!connectorToken) {
      socket.destroy();
      return;
    }

    const verified = await verifyConnectorToken(connectorToken);
    if (!verified.ok) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const connector = {
        ws,
        connectorToken,
        connectorId: verified.connector.connectorId,
        slug: verified.connector.endpointSlug,
        tenantId: verified.connector.tenantId,
        capacity: 100,
        activeRequests: 0,
        connectedAt: nowIso(),
        heartbeatTimer: null,
      };
      connectorsBySlug.set(connector.slug, connector);

      ws.on("message", (raw) => parseConnectorMessage(connector, raw));
      ws.on("close", () => unregisterConnector(connector));
      ws.on("error", () => unregisterConnector(connector));

      connector.heartbeatTimer = setInterval(() => {
        sendHeartbeat(connector).catch((err) => {
          ws.close(1011, String(err.message || err));
        });
      }, HEARTBEAT_MS);

      sendHeartbeat(connector, { status: "online" }).catch(() => {
        ws.close(1011, "initial_heartbeat_failed");
      });

      ws.send(
        JSON.stringify({
          type: "connected",
          connector_id: connector.connectorId,
          tenant_slug: connector.slug,
          at: nowIso(),
        }),
      );
    });
  } catch {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
});
