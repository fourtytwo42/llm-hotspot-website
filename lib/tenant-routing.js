import { getEndpointsBaseDomain } from "./config";

function stripPort(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function resolveTenantSlugFromHost(hostHeader) {
  const host = stripPort(hostHeader);
  const baseDomain = stripPort(getEndpointsBaseDomain());

  if (!host || !baseDomain) return null;
  if (host === baseDomain || host === `www.${baseDomain}`) return null;
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const suffix = `.${baseDomain}`;
  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  return subdomain;
}

