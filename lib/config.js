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
