import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getRelayConnectorSigningSecret,
  getRelayConnectorTtlSeconds,
  planCatalog,
} from "./config";

const storeDir = path.join(process.cwd(), "data");
const storePath = path.join(storeDir, "store.json");

const defaultStore = {
  orders: [],
  licenses: [],
  subscriptions: {},
  activations: [],
  notifications: [],
  tenantEndpoints: [],
  connectorSessions: [],
};

function isoNow() {
  return new Date().toISOString();
}

function toIso(ts) {
  return new Date(ts).toISOString();
}

function randomHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString("hex");
}

function normalizeOrder(order) {
  return {
    ...order,
    status: order.status || "pending",
    licenseKeyIssued: Boolean(order.licenseKeyIssued),
    paidAt: order.paidAt || null,
    updatedAt: order.updatedAt || isoNow(),
  };
}

function normalizeLicense(license) {
  return {
    licenseId: license.licenseId || `lic_${randomHex(10)}`,
    licenseKey: license.licenseKey,
    email: license.email || null,
    status: license.status || "active",
    planId: license.planId || license.tier || "pro",
    tier: license.tier || license.planId || "pro",
    provider: license.provider || null,
    providerRef: license.providerRef || null,
    createdAt: license.createdAt || isoNow(),
    updatedAt: license.updatedAt || isoNow(),
    expiresAt: license.expiresAt || null,
    nextDueAt: license.nextDueAt || license.expiresAt || null,
    firstClaimedAt: license.firstClaimedAt || null,
    claimedDeviceId: license.claimedDeviceId || null,
    lastCheckedAt: license.lastCheckedAt || null,
    lastPaymentAt: license.lastPaymentAt || null,
    reminderState: {
      sentDue7At: license.reminderState?.sentDue7At || null,
      sentDue1At: license.reminderState?.sentDue1At || null,
      sentExpiredAt: license.reminderState?.sentExpiredAt || null,
    },
    sourceOrderRef: license.sourceOrderRef || null,
    activationCount: Number.isFinite(license.activationCount) ? license.activationCount : 0,
  };
}

function normalizeStore(store) {
  return {
    orders: Array.isArray(store.orders) ? store.orders.map(normalizeOrder) : [],
    licenses: Array.isArray(store.licenses) ? store.licenses.map(normalizeLicense) : [],
    subscriptions: store.subscriptions && typeof store.subscriptions === "object" ? store.subscriptions : {},
    activations: Array.isArray(store.activations) ? store.activations : [],
    notifications: Array.isArray(store.notifications) ? store.notifications : [],
    tenantEndpoints: Array.isArray(store.tenantEndpoints)
      ? store.tenantEndpoints.map(normalizeTenantEndpoint)
      : [],
    connectorSessions: Array.isArray(store.connectorSessions)
      ? store.connectorSessions.map(normalizeConnectorSession)
      : [],
  };
}

function normalizeTenantEndpoint(endpoint) {
  return {
    tenantId: endpoint.tenantId || `ten_${randomHex(10)}`,
    licenseKey: endpoint.licenseKey,
    slug: String(endpoint.slug || "").toLowerCase(),
    status: endpoint.status || "active",
    upstreamBaseUrl: endpoint.upstreamBaseUrl || null,
    endpointTokenHash: endpoint.endpointTokenHash || null,
    remoteConsoleKey: endpoint.remoteConsoleKey || `rcs_${randomHex(24)}`,
    relayConnectorId: endpoint.relayConnectorId || null,
    relayLastSeenAt: endpoint.relayLastSeenAt || null,
    relayStatus: endpoint.relayStatus || "offline",
    relayCapabilities:
      endpoint.relayCapabilities && typeof endpoint.relayCapabilities === "object"
        ? endpoint.relayCapabilities
        : null,
    relayVersion: endpoint.relayVersion || null,
    createdAt: endpoint.createdAt || isoNow(),
    updatedAt: endpoint.updatedAt || isoNow(),
  };
}

function normalizeConnectorSession(session) {
  return {
    connectorId: session.connectorId || `conn_${randomHex(10)}`,
    tenantId: session.tenantId || null,
    licenseKey: session.licenseKey || null,
    endpointSlug: String(session.endpointSlug || "").toLowerCase(),
    tokenHash: session.tokenHash || null,
    deviceId: session.deviceId || null,
    issuedAt: session.issuedAt || isoNow(),
    expiresAt: session.expiresAt || null,
    lastSeenAt: session.lastSeenAt || null,
    revokedAt: session.revokedAt || null,
    status: session.status || "issued",
    capacity: Number.isFinite(session.capacity) ? session.capacity : null,
    activeRequests: Number.isFinite(session.activeRequests) ? session.activeRequests : null,
    relayVersion: session.relayVersion || null,
    relayCapabilities:
      session.relayCapabilities && typeof session.relayCapabilities === "object"
        ? session.relayCapabilities
        : null,
    updatedAt: session.updatedAt || isoNow(),
  };
}

async function ensureStore() {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(defaultStore, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);
  return normalizeStore(parsed);
}

async function writeStore(store) {
  await fs.writeFile(storePath, JSON.stringify(normalizeStore(store), null, 2));
}

function getExpiryStatus(license, nowTs = Date.now()) {
  if (license.status === "revoked") return "revoked";

  const expiryTs = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;
  if (!expiryTs || expiryTs <= nowTs) return "expired";
  if (license.status === "past_due") return "past_due";
  return "active";
}

function licenseFeatures(planId) {
  const plan = planCatalog[planId] || planCatalog.pro;
  return {
    maxOpenAiAccounts: plan.maxOpenAiAccounts,
    cloudflareTunnel: plan.cloudflareTunnel,
  };
}

function toLicensePayload(license) {
  const status = getExpiryStatus(license);
  const nowTs = Date.now();
  const dueTs = license.nextDueAt ? new Date(license.nextDueAt).getTime() : 0;
  const daysUntilDue = dueTs ? Math.ceil((dueTs - nowTs) / (24 * 60 * 60 * 1000)) : null;
  const isExpired = status === "expired";
  const isUnpaid = status === "past_due" || status === "expired";

  return {
    licenseKey: license.licenseKey,
    status,
    tier: license.tier,
    planId: license.planId,
    expiresAt: license.expiresAt,
    nextDueAt: license.nextDueAt,
    daysUntilDue,
    isExpired,
    isUnpaid,
    ...licenseFeatures(license.planId),
  };
}

export function generateOrderRef(prefix = "ord") {
  return `${prefix}_${randomHex(8)}`;
}

export function generateLicenseKey() {
  const blocks = Array.from({ length: 4 }, () => randomHex(3).toUpperCase());
  return `LLMH-${blocks.join("-")}`;
}

export function generateNotificationId() {
  return `noti_${randomHex(10)}`;
}

export async function createOrder(order) {
  const store = await readStore();
  store.orders.push(normalizeOrder(order));
  await writeStore(store);
  return order;
}

export async function findOrderByRef(orderRef) {
  const store = await readStore();
  return store.orders.find((order) => order.orderRef === orderRef) || null;
}

export async function findOrderByProviderRef(provider, providerRef) {
  const store = await readStore();
  return (
    store.orders.find(
      (order) => order.provider === provider && order.providerRef === providerRef,
    ) || null
  );
}

export async function updateOrder(orderRef, updater) {
  const store = await readStore();
  const idx = store.orders.findIndex((order) => order.orderRef === orderRef);
  if (idx < 0) return null;
  const nextOrder = normalizeOrder(updater(store.orders[idx]));
  store.orders[idx] = nextOrder;
  await writeStore(store);
  return nextOrder;
}

export async function logNotification(entry) {
  const store = await readStore();
  store.notifications.push({
    id: entry.id || generateNotificationId(),
    licenseKey: entry.licenseKey || null,
    email: entry.email || null,
    type: entry.type || "unknown",
    provider: entry.provider || null,
    status: entry.status || "sent",
    error: entry.error || null,
    sentAt: entry.sentAt || isoNow(),
  });
  await writeStore(store);
}

export async function issueOrRenewLicense({
  orderRef,
  email,
  provider,
  providerRef,
  planId = "pro",
  renewalWindowMs,
}) {
  if (!email) {
    return { ok: false, error: "missing_email", license: null };
  }

  const store = await readStore();
  const now = new Date();
  const windowMs = renewalWindowMs || planCatalog.pro.renewalWindowMs;
  const nowTs = now.getTime();

  let existing = store.licenses.find(
    (license) =>
      (providerRef && license.providerRef === providerRef) ||
      (email && license.email === email),
  );

  let isNew = false;
  if (!existing) {
    const expiryTs = nowTs + windowMs;
    existing = normalizeLicense({
      licenseKey: generateLicenseKey(),
      email,
      status: "active",
      tier: planId,
      planId,
      provider,
      providerRef: providerRef || null,
      sourceOrderRef: orderRef,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: toIso(expiryTs),
      nextDueAt: toIso(expiryTs),
      firstClaimedAt: null,
      claimedDeviceId: null,
      lastCheckedAt: null,
      lastPaymentAt: now.toISOString(),
      activationCount: 0,
    });
    store.licenses.push(existing);
    isNew = true;
  } else {
    const currentExpiry = existing.expiresAt ? new Date(existing.expiresAt).getTime() : nowTs;
    const baseTs = Math.max(currentExpiry, nowTs);
    const newExpiryTs = baseTs + windowMs;
    existing.expiresAt = toIso(newExpiryTs);
    existing.nextDueAt = toIso(newExpiryTs);
    existing.status = "active";
    existing.tier = planId;
    existing.planId = planId;
    existing.updatedAt = now.toISOString();
    existing.lastPaymentAt = now.toISOString();
    existing.provider = provider;
    existing.providerRef = providerRef || existing.providerRef;
    existing.email = email || existing.email;
    existing.sourceOrderRef = orderRef || existing.sourceOrderRef;
  }

  if (providerRef) {
    store.subscriptions[`${provider}:${providerRef}`] = existing.licenseKey;
  }

  await writeStore(store);
  return { ok: true, license: existing, isNew };
}

export async function findLicenseByKey(licenseKey) {
  const store = await readStore();
  return store.licenses.find((license) => license.licenseKey === licenseKey) || null;
}

export async function findLicenseByOrder(orderRef) {
  const store = await readStore();
  const order = store.orders.find((entry) => entry.orderRef === orderRef);
  if (!order) return null;
  return store.licenses.find((license) => license.sourceOrderRef === orderRef) || null;
}

export async function listLicenses() {
  const store = await readStore();
  return store.licenses;
}

export async function listNotifications() {
  const store = await readStore();
  return store.notifications;
}

export async function listOrders() {
  const store = await readStore();
  return store.orders;
}

async function persistLicenseUpdate(store, license) {
  const idx = store.licenses.findIndex((entry) => entry.licenseKey === license.licenseKey);
  if (idx >= 0) {
    store.licenses[idx] = normalizeLicense(license);
  }
}

export async function updateLicense(licenseKey, updater) {
  const store = await readStore();
  const idx = store.licenses.findIndex((entry) => entry.licenseKey === licenseKey);
  if (idx < 0) return null;
  const next = normalizeLicense(updater(store.licenses[idx]));
  store.licenses[idx] = next;
  await writeStore(store);
  return next;
}

export async function markReminderSent(licenseKey, reminderField) {
  const store = await readStore();
  const license = store.licenses.find((entry) => entry.licenseKey === licenseKey);
  if (!license) return null;
  license.reminderState[reminderField] = isoNow();
  license.updatedAt = isoNow();
  await persistLicenseUpdate(store, license);
  await writeStore(store);
  return license;
}

export async function activateLicense({ licenseKey, deviceId }) {
  const store = await readStore();
  const license = store.licenses.find((entry) => entry.licenseKey === licenseKey);

  if (!license) {
    return { ok: false, reason: "invalid_key" };
  }

  const status = getExpiryStatus(license);
  if (status === "expired" || status === "past_due") {
    license.status = status;
    license.updatedAt = isoNow();
    await persistLicenseUpdate(store, license);
    await writeStore(store);
    return { ok: false, reason: "expired_unpaid" };
  }

  if (!license.claimedDeviceId) {
    license.claimedDeviceId = deviceId;
    license.firstClaimedAt = isoNow();
  } else if (license.claimedDeviceId !== deviceId) {
    return { ok: false, reason: "device_mismatch" };
  }

  const activationKey = `${licenseKey}:${deviceId}`;
  const alreadyActivated = store.activations.find(
    (entry) => entry.activationKey === activationKey,
  );

  if (!alreadyActivated) {
    store.activations.push({
      activationKey,
      licenseKey,
      deviceId,
      activatedAt: isoNow(),
    });
    license.activationCount += 1;
  }

  license.lastCheckedAt = isoNow();
  license.updatedAt = isoNow();
  await persistLicenseUpdate(store, license);
  await writeStore(store);

  return {
    ok: true,
    license: toLicensePayload(license),
  };
}

export async function getLicenseStatus({ licenseKey, deviceId }) {
  const store = await readStore();
  const license = store.licenses.find((entry) => entry.licenseKey === licenseKey);

  if (!license) {
    return { ok: false, reason: "invalid_key" };
  }

  if (!license.claimedDeviceId) {
    return { ok: false, reason: "claim_required" };
  }

  if (license.claimedDeviceId !== deviceId) {
    return { ok: false, reason: "device_mismatch" };
  }

  license.status = getExpiryStatus(license);
  license.lastCheckedAt = isoNow();
  license.updatedAt = isoNow();
  await persistLicenseUpdate(store, license);
  await writeStore(store);

  return {
    ok: true,
    license: toLicensePayload(license),
  };
}

export function summarizeLicenseForOrder(license) {
  if (!license) return null;
  return {
    key: license.licenseKey,
    tier: license.tier,
    planId: license.planId,
    status: getExpiryStatus(license),
    expiresAt: license.expiresAt,
    nextDueAt: license.nextDueAt,
    email: license.email,
    claimedDeviceId: license.claimedDeviceId,
  };
}

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function isValidEndpointSlug(raw) {
  const slug = normalizeSlug(raw);
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(slug);
}

function hashEndpointToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeRemoteConsoleKey(raw) {
  return String(raw || "").trim();
}

function hashConnectorToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getConnectorSecretOrThrow() {
  const secret = getRelayConnectorSigningSecret();
  if (!secret) {
    throw new Error("RELAY_CONNECTOR_SIGNING_SECRET is required");
  }
  return secret;
}

function signConnectorPayload(payload) {
  const secret = getConnectorSecretOrThrow();
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("base64url");
}

function createConnectorToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signConnectorPayload(payload);
  return `rct.${encodedPayload}.${signature}`;
}

function parseConnectorToken(token) {
  const raw = String(token || "").trim();
  if (!raw.startsWith("rct.")) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [, encodedPayload, signature] = parts;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const expected = signConnectorPayload(payload);
  if (expected !== signature) return null;
  return payload;
}

function isLicenseEligibleForEndpoint(license) {
  const status = getExpiryStatus(license);
  if (status !== "active") return false;
  const features = licenseFeatures(license.planId);
  return Boolean(features.cloudflareTunnel);
}

export async function createTenantEndpoint({
  licenseKey,
  requestedSlug,
  upstreamBaseUrl = null,
}) {
  const store = await readStore();
  const license = store.licenses.find((entry) => entry.licenseKey === licenseKey);

  if (!license) {
    return { ok: false, reason: "invalid_license" };
  }

  if (!isLicenseEligibleForEndpoint(license)) {
    return { ok: false, reason: "plan_not_eligible" };
  }

  if (store.tenantEndpoints.some((entry) => entry.licenseKey === licenseKey)) {
    return { ok: false, reason: "endpoint_exists" };
  }

  const slug = normalizeSlug(requestedSlug);
  if (!isValidEndpointSlug(slug)) {
    return { ok: false, reason: "invalid_slug" };
  }

  if (store.tenantEndpoints.some((entry) => entry.slug === slug)) {
    return { ok: false, reason: "slug_taken" };
  }

  const endpointToken = `ehs_${randomHex(24)}`;
  const endpoint = normalizeTenantEndpoint({
    licenseKey,
    slug,
    status: "active",
    upstreamBaseUrl,
    endpointTokenHash: hashEndpointToken(endpointToken),
  });

  store.tenantEndpoints.push(endpoint);
  await writeStore(store);

  return {
    ok: true,
    endpoint: {
      tenantId: endpoint.tenantId,
      slug: endpoint.slug,
      status: endpoint.status,
      upstreamBaseUrl: endpoint.upstreamBaseUrl,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    },
    endpointToken,
  };
}

export async function updateTenantEndpointUpstream({ licenseKey, upstreamBaseUrl }) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find((entry) => entry.licenseKey === licenseKey);
  if (!endpoint) {
    return { ok: false, reason: "endpoint_not_found" };
  }
  endpoint.upstreamBaseUrl = upstreamBaseUrl || null;
  endpoint.updatedAt = isoNow();
  await writeStore(store);
  return {
    ok: true,
    endpoint: {
      tenantId: endpoint.tenantId,
      slug: endpoint.slug,
      status: endpoint.status,
      upstreamBaseUrl: endpoint.upstreamBaseUrl,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    },
  };
}

export async function findTenantEndpointBySlug(slugValue) {
  const store = await readStore();
  const slug = normalizeSlug(slugValue);
  const endpoint = store.tenantEndpoints.find((entry) => entry.slug === slug) || null;
  if (!endpoint) return null;
  if (!endpoint.remoteConsoleKey) {
    endpoint.remoteConsoleKey = `rcs_${randomHex(24)}`;
    endpoint.updatedAt = isoNow();
    await writeStore(store);
  }
  return endpoint;
}

export function verifyTenantEndpointToken(endpoint, token) {
  if (!endpoint?.endpointTokenHash || !token) return false;
  return endpoint.endpointTokenHash === hashEndpointToken(token);
}

function toTenantEndpointPayload(endpoint) {
  if (!endpoint) return null;
  return {
    tenantId: endpoint.tenantId,
    licenseKey: endpoint.licenseKey,
    slug: endpoint.slug,
    status: endpoint.status,
    upstreamBaseUrl: endpoint.upstreamBaseUrl,
    relayConnectorId: endpoint.relayConnectorId,
    relayLastSeenAt: endpoint.relayLastSeenAt,
    relayStatus: endpoint.relayStatus,
    relayCapabilities: endpoint.relayCapabilities,
    relayVersion: endpoint.relayVersion,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export async function findTenantEndpointByLicenseKey(licenseKey) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find((entry) => entry.licenseKey === licenseKey);
  if (endpoint && !endpoint.remoteConsoleKey) {
    endpoint.remoteConsoleKey = `rcs_${randomHex(24)}`;
    endpoint.updatedAt = isoNow();
    await writeStore(store);
  }
  return toTenantEndpointPayload(endpoint);
}

export async function verifyRemoteConsoleAccessKey({ endpointSlug, accessKey }) {
  const endpoint = await findTenantEndpointBySlug(endpointSlug);
  if (!endpoint) return false;
  const candidate = normalizeRemoteConsoleKey(accessKey);
  if (!candidate) return false;
  return endpoint.remoteConsoleKey === candidate;
}

export async function getRemoteConsoleAccessKeyByLicenseKey(licenseKey) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find((entry) => entry.licenseKey === licenseKey);
  if (!endpoint) return null;
  if (!endpoint.remoteConsoleKey) {
    endpoint.remoteConsoleKey = `rcs_${randomHex(24)}`;
    endpoint.updatedAt = isoNow();
    await writeStore(store);
  }
  return endpoint.remoteConsoleKey;
}

export async function rotateTenantEndpointToken(licenseKey) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find((entry) => entry.licenseKey === licenseKey);
  if (!endpoint) {
    return { ok: false, reason: "endpoint_not_found" };
  }

  const endpointToken = `ehs_${randomHex(24)}`;
  endpoint.endpointTokenHash = hashEndpointToken(endpointToken);
  endpoint.updatedAt = isoNow();
  await writeStore(store);

  return {
    ok: true,
    endpoint: toTenantEndpointPayload(endpoint),
    endpointToken,
  };
}

export async function issueConnectorSession({
  licenseKey,
  endpointSlug,
  deviceId,
  relayWsUrl,
  relayHttpBase,
}) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find(
    (entry) => entry.licenseKey === licenseKey && entry.slug === normalizeSlug(endpointSlug),
  );
  if (!endpoint) {
    return { ok: false, reason: "endpoint_not_found" };
  }
  if (endpoint.status !== "active") {
    return { ok: false, reason: "endpoint_inactive" };
  }

  const now = Date.now();
  const ttlSeconds = getRelayConnectorTtlSeconds();
  const expiresAt = toIso(now + ttlSeconds * 1000);
  const connectorId = `conn_${randomHex(12)}`;
  const tokenPayload = {
    connectorId,
    slug: endpoint.slug,
    tenantId: endpoint.tenantId,
    exp: Math.floor(now / 1000) + ttlSeconds,
    iat: Math.floor(now / 1000),
  };
  const connectorToken = createConnectorToken(tokenPayload);

  const session = normalizeConnectorSession({
    connectorId,
    tenantId: endpoint.tenantId,
    licenseKey,
    endpointSlug: endpoint.slug,
    tokenHash: hashConnectorToken(connectorToken),
    deviceId,
    issuedAt: isoNow(),
    expiresAt,
    status: "issued",
    updatedAt: isoNow(),
  });
  store.connectorSessions.push(session);

  endpoint.relayConnectorId = connectorId;
  endpoint.relayStatus = "issued";
  endpoint.relayLastSeenAt = null;
  endpoint.updatedAt = isoNow();
  await writeStore(store);

  return {
    ok: true,
    connector: {
      connectorId,
      tenantId: endpoint.tenantId,
      endpointSlug: endpoint.slug,
      issuedAt: session.issuedAt,
      expiresAt,
      relayWsUrl,
      relayHttpBase,
    },
    connectorToken,
  };
}

export async function validateConnectorToken(connectorToken) {
  const payload = parseConnectorToken(connectorToken);
  if (!payload?.connectorId || !payload?.slug || !payload?.tenantId || !payload?.exp) {
    return { ok: false, reason: "invalid_connector_token" };
  }
  if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "connector_token_expired" };
  }

  const store = await readStore();
  const session = store.connectorSessions.find(
    (entry) =>
      entry.connectorId === payload.connectorId &&
      entry.endpointSlug === payload.slug &&
      entry.tenantId === payload.tenantId,
  );
  if (!session || session.revokedAt) {
    return { ok: false, reason: "connector_session_not_found" };
  }
  if (session.tokenHash !== hashConnectorToken(connectorToken)) {
    return { ok: false, reason: "connector_token_mismatch" };
  }

  return {
    ok: true,
    connector: {
      connectorId: session.connectorId,
      tenantId: session.tenantId,
      endpointSlug: session.endpointSlug,
      licenseKey: session.licenseKey,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      status: session.status,
    },
  };
}

export async function updateConnectorHeartbeat({
  connectorId,
  status,
  capacity,
  activeRequests,
  relayVersion,
  relayCapabilities,
}) {
  const store = await readStore();
  const session = store.connectorSessions.find(
    (entry) => entry.connectorId === connectorId && !entry.revokedAt,
  );
  if (!session) {
    return { ok: false, reason: "connector_session_not_found" };
  }

  session.status = status || "online";
  session.lastSeenAt = isoNow();
  session.capacity = Number.isFinite(capacity) ? capacity : null;
  session.activeRequests = Number.isFinite(activeRequests) ? activeRequests : null;
  session.relayVersion = relayVersion || session.relayVersion;
  session.relayCapabilities =
    relayCapabilities && typeof relayCapabilities === "object"
      ? relayCapabilities
      : session.relayCapabilities;
  session.updatedAt = isoNow();

  const endpoint = store.tenantEndpoints.find((entry) => entry.tenantId === session.tenantId);
  if (endpoint) {
    endpoint.relayConnectorId = session.connectorId;
    endpoint.relayLastSeenAt = session.lastSeenAt;
    endpoint.relayStatus = session.status;
    endpoint.relayVersion = session.relayVersion;
    endpoint.relayCapabilities = session.relayCapabilities;
    endpoint.updatedAt = isoNow();
  }
  await writeStore(store);

  return {
    ok: true,
    connector: {
      connectorId: session.connectorId,
      tenantId: session.tenantId,
      endpointSlug: session.endpointSlug,
      status: session.status,
      lastSeenAt: session.lastSeenAt,
      capacity: session.capacity,
      activeRequests: session.activeRequests,
      relayVersion: session.relayVersion,
      relayCapabilities: session.relayCapabilities,
    },
  };
}

export async function getConnectorStatusBySlug(endpointSlug) {
  const store = await readStore();
  const slug = normalizeSlug(endpointSlug);
  const endpoint = store.tenantEndpoints.find((entry) => entry.slug === slug);
  if (!endpoint) {
    return { ok: false, reason: "endpoint_not_found" };
  }
  const connector = endpoint.relayConnectorId
    ? store.connectorSessions.find(
        (entry) => entry.connectorId === endpoint.relayConnectorId && !entry.revokedAt,
      )
    : null;
  return {
    ok: true,
    endpoint: toTenantEndpointPayload(endpoint),
    connector: connector
      ? {
          connectorId: connector.connectorId,
          status: connector.status,
          lastSeenAt: connector.lastSeenAt,
          capacity: connector.capacity,
          activeRequests: connector.activeRequests,
          relayVersion: connector.relayVersion,
          relayCapabilities: connector.relayCapabilities,
          expiresAt: connector.expiresAt,
        }
      : null,
  };
}

export async function getOnlineConnectorBySlug(endpointSlug, staleThresholdMs = 90_000) {
  const status = await getConnectorStatusBySlug(endpointSlug);
  if (!status.ok || !status.connector) {
    return { ok: false, reason: "connector_not_found" };
  }
  const lastSeenTs = status.connector.lastSeenAt
    ? new Date(status.connector.lastSeenAt).getTime()
    : 0;
  if (!lastSeenTs || Date.now() - lastSeenTs > staleThresholdMs) {
    return { ok: false, reason: "connector_offline" };
  }
  if (status.connector.status !== "online") {
    return { ok: false, reason: "connector_not_online" };
  }
  return {
    ok: true,
    connector: status.connector,
    endpoint: status.endpoint,
  };
}
