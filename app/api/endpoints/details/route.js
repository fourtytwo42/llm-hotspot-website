import { NextResponse } from "next/server";

import { getEndpointsBaseDomain } from "@/lib/config";
import { requireEndpointManagerAccess } from "@/lib/endpoint-manager-auth";
import {
  findTenantEndpointByLicenseKey,
  getConnectorStatusBySlug,
  getRemoteConsoleAccessKeyByLicenseKey,
} from "@/lib/store";

function endpointUrlForSlug(slug) {
  return `https://${slug}.${getEndpointsBaseDomain()}`;
}

function remoteConsoleUrlForSlug(slug, accessKey) {
  const url = new URL(`${endpointUrlForSlug(slug)}/console`);
  if (accessKey) {
    url.searchParams.set("admin_key", accessKey);
  }
  return url.toString();
}

export async function POST(request) {
  try {
    const { licenseKey, deviceId } = await request.json();
    const access = await requireEndpointManagerAccess({ licenseKey, deviceId });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }

    const endpoint = await findTenantEndpointByLicenseKey(licenseKey);
    if (!endpoint) {
      return NextResponse.json({ ok: true, endpoint: null });
    }
    const remoteConsoleAccessKey = await getRemoteConsoleAccessKeyByLicenseKey(licenseKey);

    return NextResponse.json({
      ok: true,
      endpoint: {
        ...endpoint,
        publicBaseUrl: endpointUrlForSlug(endpoint.slug),
        remoteConsoleUrl: remoteConsoleUrlForSlug(endpoint.slug, remoteConsoleAccessKey),
      },
      connector: (await getConnectorStatusBySlug(endpoint.slug)).connector || null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Endpoint lookup failed" },
      { status: 500 },
    );
  }
}
