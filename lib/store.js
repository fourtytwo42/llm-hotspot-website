import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { planCatalog } from "./config";

const storeDir = path.join(process.cwd(), "data");
const storePath = path.join(storeDir, "store.json");

const defaultStore = {
  orders: [],
  licenses: [],
  subscriptions: {},
  activations: [],
  notifications: [],
  tenantEndpoints: [],
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
    createdAt: endpoint.createdAt || isoNow(),
    updatedAt: endpoint.updatedAt || isoNow(),
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
  return store.tenantEndpoints.find((entry) => entry.slug === slug) || null;
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
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export async function findTenantEndpointByLicenseKey(licenseKey) {
  const store = await readStore();
  const endpoint = store.tenantEndpoints.find((entry) => entry.licenseKey === licenseKey);
  return toTenantEndpointPayload(endpoint);
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
