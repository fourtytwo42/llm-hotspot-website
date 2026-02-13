import { NextResponse } from "next/server";

import { getRelayInternalSecret } from "@/lib/config";
import { updateConnectorHeartbeat, validateConnectorToken } from "@/lib/store";

function readBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return "";
}

function requireRelayInternalSecret(request) {
  const configured = getRelayInternalSecret();
  if (!configured) return true;
  const supplied = request.headers.get("x-relay-secret") || "";
  return supplied && supplied === configured;
}

export async function POST(request) {
  try {
    if (!requireRelayInternalSecret(request)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const {
      connectorId,
      status,
      capacity,
      activeRequests,
      relayVersion,
      relayCapabilities,
    } = await request.json();
    const connectorToken = readBearerToken(request);
    if (!connectorToken || !connectorId) {
      return NextResponse.json(
        { ok: false, error: "connector bearer token and connectorId are required" },
        { status: 400 },
      );
    }

    const token = await validateConnectorToken(connectorToken);
    if (!token.ok || token.connector.connectorId !== connectorId) {
      return NextResponse.json({ ok: false, error: "invalid_connector_token" }, { status: 401 });
    }

    const result = await updateConnectorHeartbeat({
      connectorId,
      status,
      capacity,
      activeRequests,
      relayVersion,
      relayCapabilities,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Connector heartbeat failed" },
      { status: 500 },
    );
  }
}

