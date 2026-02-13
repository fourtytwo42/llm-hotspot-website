const monthInMs = 30 * 24 * 60 * 60 * 1000;

export const planCatalog = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    interval: "forever",
    maxOpenAiAccounts: 1,
    cloudflareTunnel: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 5,
    interval: "month",
    renewalWindowMs: monthInMs,
    maxOpenAiAccounts: null,
    cloudflareTunnel: true,
  },
};

export function getBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}

export function getPaypalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paymentDevMode() {
  return process.env.PAYMENT_DEV_MODE === "true";
}

export function getEndpointsBaseDomain() {
  return process.env.ENDPOINTS_BASE_DOMAIN || "llmhotspot.com";
}

export function getRelayWsUrl() {
  return process.env.RELAY_WS_URL || "ws://localhost:8789/ws/connect";
}

export function getRelayHttpBase() {
  return process.env.RELAY_HTTP_BASE || "http://localhost:8789";
}

export function getRelayConnectorSigningSecret() {
  return process.env.RELAY_CONNECTOR_SIGNING_SECRET || "";
}

export function getRelayConnectorTtlSeconds() {
  const raw = Number.parseInt(process.env.RELAY_CONNECTOR_TTL_SECONDS || "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 60 * 60 * 24 * 7;
  return raw;
}

export function getRelayInternalSecret() {
  return process.env.RELAY_INTERNAL_SECRET || "";
}
