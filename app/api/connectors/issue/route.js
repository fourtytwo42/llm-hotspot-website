import { NextResponse } from "next/server";

import { requireEndpointManagerAccess } from "@/lib/endpoint-manager-auth";
import { getRelayHttpBase, getRelayWsUrl } from "@/lib/config";
import { issueConnectorSession } from "@/lib/store";

export async function POST(request) {
  try {
    const { licenseKey, deviceId, endpointSlug } = await request.json();
    const access = await requireEndpointManagerAccess({ licenseKey, deviceId });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }

    if (!endpointSlug) {
      return NextResponse.json(
        { ok: false, error: "endpointSlug is required" },
        { status: 400 },
      );
    }

    const result = await issueConnectorSession({
      licenseKey,
      endpointSlug,
      deviceId,
      relayWsUrl: getRelayWsUrl(),
      relayHttpBase: getRelayHttpBase(),
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      connector: result.connector,
      connectorToken: result.connectorToken,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Connector session issue failed" },
      { status: 500 },
    );
  }
}

