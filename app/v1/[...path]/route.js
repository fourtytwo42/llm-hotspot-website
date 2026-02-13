import { NextResponse } from "next/server";

import { getRelayHttpBase } from "@/lib/config";
import { checkRateLimit, getProxyRateLimitConfig } from "@/lib/rate-limit";
import { findTenantEndpointBySlug, getOnlineConnectorBySlug } from "@/lib/store";
import { resolveTenantSlugFromHost } from "@/lib/tenant-routing";

export const runtime = "nodejs";

function getHostHeader(request) {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  );
}

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function copyRequestHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("x-forwarded-host");
  headers.delete("content-length");
  return headers;
}

async function proxyRequest(request, { params }) {
  const host = getHostHeader(request);
  const slug = resolveTenantSlugFromHost(host);
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "tenant_host_required" },
      { status: 400 },
    );
  }

  const endpoint = await findTenantEndpointBySlug(slug);
  if (!endpoint || endpoint.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "unknown_or_inactive_tenant" },
      { status: 404 },
    );
  }

  const limiter = getProxyRateLimitConfig();
  const rateKey = `${endpoint.slug}:${getClientIp(request)}`;
  const rate = checkRateLimit(rateKey, limiter);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: {
          "retry-after": String(rate.retryAfterSeconds),
          "x-ratelimit-limit": String(limiter.max),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }

  const connector = await getOnlineConnectorBySlug(slug);
  if (!connector.ok) {
    return NextResponse.json(
      { ok: false, error: "tenant_offline", reason: connector.reason },
      { status: 503 },
    );
  }

  const resolvedParams = await Promise.resolve(params);
  const pathParts = resolvedParams?.path || [];
  const proxyPath = pathParts.join("/");
  const relayUrl = new URL(
    `${getRelayHttpBase().replace(/\/+$/, "")}/v1/${proxyPath.replace(/^\/+/, "")}`,
  );
  relayUrl.search = new URL(request.url).search;

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const headers = copyRequestHeaders(request);
  headers.set("x-forwarded-host", host);
  headers.set("x-tenant-slug", slug);
  headers.set("x-relay-connector-id", connector.connector.connectorId);
  headers.set("x-llmhotspot-proxy-mode", "relay");

  const upstreamResponse = await fetch(relayUrl, {
    method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("x-llmhotspot-tenant", endpoint.slug);
  responseHeaders.set("x-llmhotspot-proxy", "v1");
  responseHeaders.set("x-ratelimit-limit", String(limiter.max));
  responseHeaders.set("x-ratelimit-remaining", String(rate.remaining));
  responseHeaders.set("x-llmhotspot-relay", "managed");
  responseHeaders.set("x-llmhotspot-connector-id", connector.connector.connectorId);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function POST(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function PUT(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function PATCH(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function DELETE(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function OPTIONS(request, ctx) {
  return proxyRequest(request, ctx);
}

export async function HEAD(request, ctx) {
  return proxyRequest(request, ctx);
}
