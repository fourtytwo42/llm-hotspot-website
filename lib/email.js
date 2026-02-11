import nodemailer from "nodemailer";

import { getBaseUrl } from "./config";
import { logNotification } from "./store";

let cachedTransport = null;

function smtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
  };
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransport() {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport(smtpConfig());
  }
  return cachedTransport;
}

async function sendAndLog({ to, subject, text, html, type, licenseKey, provider }) {
  if (!to) {
    await logNotification({
      type,
      licenseKey,
      email: null,
      provider,
      status: "skipped",
      error: "missing_recipient",
    });
    return { ok: false, skipped: true, error: "missing_recipient" };
  }

  if (!isEmailConfigured()) {
    await logNotification({
      type,
      licenseKey,
      email: to,
      provider,
      status: "skipped",
      error: "smtp_not_configured",
    });
    return { ok: false, skipped: true, error: "smtp_not_configured" };
  }

  try {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });

    await logNotification({
      type,
      licenseKey,
      email: to,
      provider,
      status: "sent",
      sentAt: new Date().toISOString(),
    });

    return { ok: true };
  } catch (error) {
    await logNotification({
      type,
      licenseKey,
      email: to,
      provider,
      status: "failed",
      error: error.message || "send_failed",
    });
    return { ok: false, error: error.message || "send_failed" };
  }
}

export async function sendPurchaseEmail({ email, licenseKey, expiresAt, provider }) {
  const subject = "Your LLM Hotspot Pro key";
  const text = [
    "Thanks for your purchase.",
    "",
    `License key: ${licenseKey}`,
    `Next due date: ${new Date(expiresAt).toLocaleString()}`,
    `Manage your license: ${getBaseUrl()}`,
  ].join("\n");

  const html = `
    <p>Thanks for your purchase.</p>
    <p><strong>License key:</strong> ${licenseKey}</p>
    <p><strong>Next due date:</strong> ${new Date(expiresAt).toLocaleString()}</p>
    <p><a href="${getBaseUrl()}">Open LLM Hotspot</a></p>
  `;

  return sendAndLog({
    to: email,
    subject,
    text,
    html,
    type: "purchase",
    licenseKey,
    provider,
  });
}

export async function sendDueSoonEmail({
  email,
  licenseKey,
  daysUntilDue,
  dueAt,
  provider,
}) {
  const subject = `LLM Hotspot license due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  const text = [
    "Your LLM Hotspot Pro license is due soon.",
    "",
    `License key: ${licenseKey}`,
    `Due date: ${new Date(dueAt).toLocaleString()}`,
    "",
    "Please make sure billing is up to date to avoid interruption.",
  ].join("\n");

  const html = `
    <p>Your LLM Hotspot Pro license is due soon.</p>
    <p><strong>License key:</strong> ${licenseKey}</p>
    <p><strong>Due date:</strong> ${new Date(dueAt).toLocaleString()}</p>
    <p>Please make sure billing is up to date to avoid interruption.</p>
  `;

  return sendAndLog({
    to: email,
    subject,
    text,
    html,
    type: daysUntilDue <= 1 ? "due_1_day" : "due_7_day",
    licenseKey,
    provider,
  });
}

export async function sendExpiredEmail({ email, licenseKey, expiredAt, provider }) {
  const subject = "Your LLM Hotspot license has expired";
  const text = [
    "Your LLM Hotspot Pro license has expired.",
    "",
    `License key: ${licenseKey}`,
    `Expired at: ${new Date(expiredAt).toLocaleString()}`,
    "",
    "Please renew payment to reactivate.",
  ].join("\n");

  const html = `
    <p>Your LLM Hotspot Pro license has expired.</p>
    <p><strong>License key:</strong> ${licenseKey}</p>
    <p><strong>Expired at:</strong> ${new Date(expiredAt).toLocaleString()}</p>
    <p>Please renew payment to reactivate.</p>
  `;

  return sendAndLog({
    to: email,
    subject,
    text,
    html,
    type: "expired",
    licenseKey,
    provider,
  });
}
