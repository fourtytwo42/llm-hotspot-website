#!/usr/bin/env node

const WEBSITE_BASE_URL = process.env.WEBSITE_BASE_URL || "http://localhost:3000";
const LICENSE_KEY = process.env.LICENSE_KEY || "";
const DEVICE_ID = process.env.DEVICE_ID || "";
const ENDPOINT_SLUG = process.env.ENDPOINT_SLUG || "";
const LOCAL_UPSTREAM_BASE = (process.env.LOCAL_UPSTREAM_BASE || "http://localhost:11434")
  .replace(/\/+$/, "");
const RECONNECT_DELAY_MS = Number.parseInt(process.env.RECONNECT_DELAY_MS || "3000", 10);

if (!LICENSE_KEY || !DEVICE_ID || !ENDPOINT_SLUG) {
  console.error(
    "Missing required envs: LICENSE_KEY, DEVICE_ID, ENDPOINT_SLUG (optional WEBSITE_BASE_URL, LOCAL_UPSTREAM_BASE)",
  );
  process.exit(1);
}

function log(...args) {
  console.log("[connector-bridge]", ...args);
}

function normalizeHeaders(raw) {
  const hopByHop = new Set([
    "host",
    "x-forwarded-host",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "expect",
    "accept-encoding",
  ]);
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null) continue;
    const key = String(k).toLowerCase();
    if (hopByHop.has(key)) continue;
    if (key.startsWith("cf-")) continue;
    out[key] = String(v);
  }
  return out;
}

async function issueConnectorSession() {
  const url = `${WEBSITE_BASE_URL.replace(/\/+$/, "")}/api/connectors/issue`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      licenseKey: LICENSE_KEY,
      deviceId: DEVICE_ID,
      endpointSlug: ENDPOINT_SLUG,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(body.error || body.reason || `connector issue failed (${response.status})`);
  }
  return body;
}

async function proxyRequest(frame) {
  const method = String(frame.method || "GET").toUpperCase();
  const path = String(frame.path || "/");
  const headers = normalizeHeaders(frame.headers);
  const body = frame.body_base64 ? Buffer.from(String(frame.body_base64), "base64") : null;
  const targetUrl = `${LOCAL_UPSTREAM_BASE}${path}`;
  log(`proxy ${method} ${path} -> ${targetUrl}`);

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
  });
  log(`upstream status ${response.status} for ${method} ${path}`);
  const responseBody = Buffer.from(await response.arrayBuffer());
  const outHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") return;
    outHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: outHeaders,
    body_base64: responseBody.toString("base64"),
  };
}

async function runConnector() {
  while (true) {
    try {
      const issued = await issueConnectorSession();
      const connector = issued.connector || {};
      const relayWsUrl = String(connector.relayWsUrl || "").trim();
      const connectorToken = String(issued.connectorToken || "").trim();
      if (!relayWsUrl || !connectorToken) {
        throw new Error("connector issue response missing relayWsUrl or connectorToken");
      }

      log(
        `connecting slug=${ENDPOINT_SLUG} connectorId=${connector.connectorId || "-"} relay=${relayWsUrl}`,
      );
      const ws = new WebSocket(relayWsUrl, {
        headers: { authorization: `Bearer ${connectorToken}` },
      });

      const closed = new Promise((resolve) => {
        ws.addEventListener("close", resolve);
        ws.addEventListener("error", resolve);
      });

      ws.addEventListener("open", () => {
        log("connected");
      });

      ws.addEventListener("message", async (event) => {
        let frame;
        try {
          frame = JSON.parse(String(event.data || ""));
        } catch {
          return;
        }
        const type = String(frame.type || "");
        const requestId = String(frame.request_id || "");
        if (type === "ping") {
          ws.send(JSON.stringify({ type: "pong", request_id: requestId || undefined }));
          return;
        }
        if (type !== "request_open" || !requestId) return;

        try {
          const proxied = await proxyRequest(frame);
          ws.send(
            JSON.stringify({
              type: "response_end",
              request_id: requestId,
              status: proxied.status,
              headers: proxied.headers,
              body_base64: proxied.body_base64,
            }),
          );
        } catch (error) {
          log(`proxy error for ${requestId}: ${String(error?.message || error)}`);
          ws.send(
            JSON.stringify({
              type: "error",
              request_id: requestId,
              message: String(error?.message || error || "upstream_failed"),
            }),
          );
        }
      });

      await closed;
      log("disconnected; reconnecting...");
    } catch (error) {
      log(`connector cycle failed: ${String(error?.message || error)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
  }
}

runConnector().catch((error) => {
  console.error("[connector-bridge] fatal:", error);
  process.exit(1);
});
