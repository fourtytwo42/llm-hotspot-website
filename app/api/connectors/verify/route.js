import { NextResponse } from "next/server";

import { getRelayInternalSecret } from "@/lib/config";
import { validateConnectorToken } from "@/lib/store";

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
    const { connectorToken } = await request.json();
    const result = await validateConnectorToken(connectorToken);
    if (!result.ok) {
      return NextResponse.json(result, { status: 401 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Connector verify failed" },
      { status: 500 },
    );
  }
}

