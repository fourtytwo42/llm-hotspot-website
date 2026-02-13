import { NextResponse } from "next/server";

import { requireEndpointManagerAccess } from "@/lib/endpoint-manager-auth";
import { updateTenantEndpointUpstream } from "@/lib/store";

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const { licenseKey, deviceId, upstreamBaseUrl } = await request.json();

    const access = await requireEndpointManagerAccess({ licenseKey, deviceId });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }

    if (!upstreamBaseUrl) {
      return NextResponse.json(
        { ok: false, error: "upstreamBaseUrl is required" },
        { status: 400 },
      );
    }

    if (!isValidHttpUrl(upstreamBaseUrl)) {
      return NextResponse.json(
        { ok: false, error: "upstreamBaseUrl must be a valid http(s) URL" },
        { status: 400 },
      );
    }

    const result = await updateTenantEndpointUpstream({
      licenseKey,
      upstreamBaseUrl,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Upstream update failed" },
      { status: 500 },
    );
  }
}
