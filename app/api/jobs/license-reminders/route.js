import { NextResponse } from "next/server";

import { sendDueSoonEmail, sendExpiredEmail } from "@/lib/email";
import { listLicenses, markReminderSent, updateLicense } from "@/lib/store";

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const direct = request.headers.get("x-cron-secret") || "";

  return bearer === secret || direct === secret;
}

function getDaysUntil(dueAt) {
  if (!dueAt) return null;
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  return Math.ceil((due - now) / (24 * 60 * 60 * 1000));
}

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const licenses = await listLicenses();
    const summary = {
      scanned: licenses.length,
      remindersDue7: 0,
      remindersDue1: 0,
      remindersExpired: 0,
      newlyExpired: 0,
    };

    for (const license of licenses) {
      const now = Date.now();
      const expiryTs = license.expiresAt ? new Date(license.expiresAt).getTime() : 0;

      if (expiryTs && now > expiryTs && license.status !== "expired") {
        await updateLicense(license.licenseKey, (current) => ({
          ...current,
          status: "expired",
          updatedAt: new Date().toISOString(),
        }));
        summary.newlyExpired += 1;
      }

      if (!license.email || !license.nextDueAt) {
        continue;
      }

      const daysUntilDue = getDaysUntil(license.nextDueAt);
      if (daysUntilDue === null) continue;

      if (daysUntilDue <= 7 && daysUntilDue > 1 && !license.reminderState?.sentDue7At) {
        await sendDueSoonEmail({
          email: license.email,
          licenseKey: license.licenseKey,
          daysUntilDue,
          dueAt: license.nextDueAt,
          provider: license.provider,
        });
        await markReminderSent(license.licenseKey, "sentDue7At");
        summary.remindersDue7 += 1;
      }

      if (daysUntilDue <= 1 && daysUntilDue >= 0 && !license.reminderState?.sentDue1At) {
        await sendDueSoonEmail({
          email: license.email,
          licenseKey: license.licenseKey,
          daysUntilDue: Math.max(daysUntilDue, 1),
          dueAt: license.nextDueAt,
          provider: license.provider,
        });
        await markReminderSent(license.licenseKey, "sentDue1At");
        summary.remindersDue1 += 1;
      }

      if (daysUntilDue < 0 && !license.reminderState?.sentExpiredAt) {
        await sendExpiredEmail({
          email: license.email,
          licenseKey: license.licenseKey,
          expiredAt: license.nextDueAt,
          provider: license.provider,
        });
        await markReminderSent(license.licenseKey, "sentExpiredAt");
        summary.remindersExpired += 1;
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "reminder job failed" },
      { status: 500 },
    );
  }
}
