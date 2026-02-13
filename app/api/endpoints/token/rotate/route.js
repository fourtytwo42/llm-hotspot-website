import { NextResponse } from "next/server";

import { getEndpointsBaseDomain } from "@/lib/config";
import { requireEndpointManagerAccess } from "@/lib/endpoint-manager-auth";
import { rotateTenantEndpointToken } from "@/lib/store";

function endpointUrlForSlug(slug) {
  return `https://${slug}.${getEndpointsBaseDomain()}`;
}

export async function POST(request) {
  try {
    const { licenseKey, deviceId } = await request.json();
    const access = await requireEndpointManagerAccess({ licenseKey, deviceId });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }

    const result = await rotateTenantEndpointToken(licenseKey);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      endpoint: {
        ...result.endpoint,
        publicBaseUrl: endpointUrlForSlug(result.endpoint.slug),
      },
      endpointToken: result.endpointToken,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Token rotation failed" },
      { status: 500 },
    );
  }
}

