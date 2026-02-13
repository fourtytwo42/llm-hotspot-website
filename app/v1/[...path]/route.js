import { NextResponse } from "next/server";

import {
  findTenantEndpointBySlug,
  verifyTenantEndpointToken,
} from "@/lib/store";
import { checkRateLimit, getProxyRateLimitConfig } from "@/lib/rate-limit";
import { resolveTenantSlugFromHost } from "@/lib/tenant-routing";

export const runtime = "nodejs";

function getHostHeader(request) {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  );
}

function getEndpointToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return request.headers.get("x-endpoint-token") || "";
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

  if (!endpoint.upstreamBaseUrl) {
    return NextResponse.json(
      { ok: false, error: "tenant_upstream_not_configured" },
      { status: 400 },
    );
  }

  const endpointToken = getEndpointToken(request);
  if (!verifyTenantEndpointToken(endpoint, endpointToken)) {
    return NextResponse.json(
      { ok: false, error: "invalid_endpoint_token" },
      { status: 401 },
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

  const pathParts = params.path || [];
  const upstreamPath = pathParts.join("/");
  const upstreamUrl = new URL(`${endpoint.upstreamBaseUrl}/v1/${upstreamPath}`);
  upstreamUrl.search = new URL(request.url).search;

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers: copyRequestHeaders(request),
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("x-llmhotspot-tenant", endpoint.slug);
  responseHeaders.set("x-llmhotspot-proxy", "v1");
  responseHeaders.set("x-ratelimit-limit", String(limiter.max));
  responseHeaders.set("x-ratelimit-remaining", String(rate.remaining));

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
