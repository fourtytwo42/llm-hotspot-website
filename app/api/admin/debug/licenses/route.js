import { NextResponse } from "next/server";

import { listLicenses, listNotifications, listOrders } from "@/lib/store";

function isAuthorized(request) {
  const adminKey = process.env.ADMIN_API_KEY;
  const fallback = process.env.CRON_SECRET;
  const expected = adminKey || fallback;
  if (!expected) return false;

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const direct = request.headers.get("x-admin-key") || "";
  return bearer === expected || direct === expected;
}

function clampLimit(raw, fallback = 100) {
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1000);
}

export async function GET(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 100);
    const includeOrders = searchParams.get("includeOrders") === "true";
    const includeNotifications = searchParams.get("includeNotifications") !== "false";

    const licenses = await listLicenses();
    const notifications = includeNotifications ? await listNotifications() : [];
    const orders = includeOrders ? await listOrders() : [];

    const sortedLicenses = [...licenses]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    const sortedNotifications = [...notifications]
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, limit);

    const sortedOrders = [...orders]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map((order) => ({
        orderRef: order.orderRef,
        provider: order.provider,
        status: order.status,
        email: order.email,
        paidAt: order.paidAt,
        licenseKeyIssued: order.licenseKeyIssued,
        updatedAt: order.updatedAt,
      }));

    return NextResponse.json({
      ok: true,
      counts: {
        licenses: licenses.length,
        notifications: notifications.length,
        orders: orders.length,
      },
      licenses: sortedLicenses,
      notifications: sortedNotifications,
      orders: sortedOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "debug endpoint failed" },
      { status: 500 },
    );
  }
}
