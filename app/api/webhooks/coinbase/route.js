import { NextResponse } from "next/server";

import { verifyCoinbaseWebhookSignature } from "@/lib/coinbase";
import { paymentDevMode, planCatalog } from "@/lib/config";
import { issueOrRenewLicense, updateOrder } from "@/lib/store";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-cc-webhook-signature");

    if (!paymentDevMode()) {
      const valid = verifyCoinbaseWebhookSignature(rawBody, signature);
      if (!valid) {
        return NextResponse.json({ error: "Invalid Coinbase webhook signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event || {};
    const type = event.type;
    const data = event.data || {};

    const orderRef = data.metadata?.orderRef || null;
    const email = data.metadata?.email || data.pricing?.local?.email || null;
    const providerRef = data.code || data.id || null;

    const paidEvent =
      type === "charge:confirmed" ||
      type === "charge:resolved" ||
      type === "charge:delayed";

    if (paidEvent && orderRef) {
      await updateOrder(orderRef, (order) => ({
        ...order,
        status: "paid",
        providerRef: providerRef || order.providerRef,
        email: email || order.email,
        updatedAt: new Date().toISOString(),
        raw: payload,
      }));

      await issueOrRenewLicense({
        orderRef,
        email,
        provider: "coinbase",
        providerRef,
        planId: "pro",
        renewalWindowMs: planCatalog.pro.renewalWindowMs,
      });
    }

    return NextResponse.json({ ok: true, type, orderRef });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }
}
