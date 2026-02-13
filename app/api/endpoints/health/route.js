import { NextResponse } from "next/server";

import { getEndpointsBaseDomain } from "@/lib/config";
import { findTenantEndpointBySlug } from "@/lib/store";
import { resolveTenantSlugFromHost } from "@/lib/tenant-routing";

function getHostHeader(request) {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  );
}

export async function GET(request) {
  try {
    const host = getHostHeader(request);
    const slug = resolveTenantSlugFromHost(host);

    if (!slug) {
      return NextResponse.json({
        ok: false,
        baseDomain: getEndpointsBaseDomain(),
        host,
        error: "tenant_subdomain_required",
      });
    }

    const endpoint = await findTenantEndpointBySlug(slug);
    if (!endpoint) {
      return NextResponse.json({
        ok: false,
        baseDomain: getEndpointsBaseDomain(),
        host,
        slug,
        error: "endpoint_not_found",
      });
    }

    return NextResponse.json({
      ok: endpoint.status === "active" && Boolean(endpoint.upstreamBaseUrl),
      baseDomain: getEndpointsBaseDomain(),
      host,
      slug: endpoint.slug,
      status: endpoint.status,
      upstreamConfigured: Boolean(endpoint.upstreamBaseUrl),
      upstreamBaseUrl: endpoint.upstreamBaseUrl,
      message:
        endpoint.status !== "active"
          ? "endpoint_inactive"
          : endpoint.upstreamBaseUrl
            ? "endpoint_ready"
            : "upstream_not_configured",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Endpoint health check failed" },
      { status: 500 },
    );
  }
}

