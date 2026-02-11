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
};

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
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

export function generateOrderRef(prefix = "ord") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function generateLicenseKey() {
  const blocks = Array.from({ length: 4 }, () =>
    crypto.randomBytes(3).toString("hex").toUpperCase(),
  );
  return `LLMH-${blocks.join("-")}`;
}

export async function createOrder(order) {
  const store = await readStore();
  store.orders.push(order);
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
  const nextOrder = updater(store.orders[idx]);
  store.orders[idx] = nextOrder;
  await writeStore(store);
  return nextOrder;
}

export async function issueOrRenewLicense({
  orderRef,
  email,
  provider,
  providerRef,
  planId = "pro",
  renewalWindowMs,
}) {
  const store = await readStore();
  const now = new Date();
  const windowMs = renewalWindowMs || planCatalog.pro.renewalWindowMs;

  let existing = store.licenses.find(
    (license) =>
      (providerRef && license.providerRef === providerRef) ||
      (email && license.email === email),
  );

  if (!existing) {
    existing = {
      licenseKey: generateLicenseKey(),
      email: email || null,
      tier: planId,
      status: "active",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + windowMs).toISOString(),
      provider,
      providerRef: providerRef || null,
      sourceOrderRef: orderRef,
      activationCount: 0,
    };
    store.licenses.push(existing);
  } else {
    const currentExpiry = existing.expiresAt
      ? new Date(existing.expiresAt).getTime()
      : now.getTime();
    const baseTs = Math.max(currentExpiry, now.getTime());
    existing.expiresAt = new Date(baseTs + windowMs).toISOString();
    existing.status = "active";
    existing.tier = planId;
    existing.updatedAt = now.toISOString();
    existing.provider = provider;
    existing.providerRef = providerRef || existing.providerRef;
  }

  if (providerRef) {
    store.subscriptions[`${provider}:${providerRef}`] = existing.licenseKey;
  }

  await writeStore(store);
  return existing;
}

export async function findLicenseByKey(licenseKey) {
  const store = await readStore();
  return store.licenses.find((license) => license.licenseKey === licenseKey) || null;
}

export async function findLicenseByOrder(orderRef) {
  const store = await readStore();
  const order = store.orders.find((entry) => entry.orderRef === orderRef);
  if (!order) return null;
  return (
    store.licenses.find((license) => license.sourceOrderRef === orderRef) || null
  );
}

export async function activateLicense({ licenseKey, deviceId }) {
  const store = await readStore();
  const license = store.licenses.find((entry) => entry.licenseKey === licenseKey);

  if (!license) {
    return { ok: false, reason: "invalid_key" };
  }

  const nowTs = Date.now();
  const expiryTs = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;
  if (!expiryTs || expiryTs < nowTs) {
    license.status = "expired";
    license.updatedAt = new Date().toISOString();
    await writeStore(store);
    return { ok: false, reason: "expired" };
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
      activatedAt: new Date().toISOString(),
    });
    license.activationCount += 1;
    license.updatedAt = new Date().toISOString();
    await writeStore(store);
  }

  return {
    ok: true,
    license: {
      licenseKey: license.licenseKey,
      tier: license.tier,
      expiresAt: license.expiresAt,
      maxOpenAiAccounts: planCatalog.pro.maxOpenAiAccounts,
      cloudflareTunnel: planCatalog.pro.cloudflareTunnel,
    },
  };
}
