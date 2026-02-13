import { NextResponse } from "next/server";

import { getEndpointsBaseDomain } from "@/lib/config";
import { getConnectorStatusBySlug } from "@/lib/store";
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

    const status = await getConnectorStatusBySlug(slug);
    if (!status.ok) {
      return NextResponse.json({
        ok: false,
        baseDomain: getEndpointsBaseDomain(),
        host,
        slug,
        error: "endpoint_not_found",
      });
    }

    const endpoint = status.endpoint;
    const connector = status.connector;
    const online = Boolean(
      connector &&
        connector.status === "online" &&
        connector.lastSeenAt &&
        Date.now() - new Date(connector.lastSeenAt).getTime() < 90_000,
    );

    return NextResponse.json({
      ok: endpoint.status === "active" && online,
      baseDomain: getEndpointsBaseDomain(),
      host,
      slug: endpoint.slug,
      status: endpoint.status,
      connector,
      message:
        endpoint.status !== "active"
          ? "endpoint_inactive"
          : online
            ? "endpoint_ready"
            : "connector_offline",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Endpoint health check failed" },
      { status: 500 },
    );
  }
}
