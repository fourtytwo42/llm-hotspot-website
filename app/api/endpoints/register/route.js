import { NextResponse } from "next/server";

import { getEndpointsBaseDomain } from "@/lib/config";
import { createTenantEndpoint } from "@/lib/store";
import { requireEndpointManagerAccess } from "@/lib/endpoint-manager-auth";

function endpointUrlForSlug(slug) {
  const baseDomain = getEndpointsBaseDomain();
  return `https://${slug}.${baseDomain}`;
}

export async function POST(request) {
  try {
    const { licenseKey, deviceId, slug, upstreamBaseUrl } = await request.json();

    const access = await requireEndpointManagerAccess({ licenseKey, deviceId });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
    }

    const result = await createTenantEndpoint({
      licenseKey,
      requestedSlug: slug,
      upstreamBaseUrl,
    });

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
      { ok: false, error: error.message || "Endpoint registration failed" },
      { status: 500 },
    );
  }
}
