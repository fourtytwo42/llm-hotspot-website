import { NextResponse } from "next/server";

import { paymentDevMode, planCatalog } from "@/lib/config";
import { verifyPaypalWebhook } from "@/lib/paypal";
import { issueOrRenewLicense, updateOrder } from "@/lib/store";

function parsePaypalEvent(payload) {
  const eventType = payload.event_type;
  const resource = payload.resource || {};

  const orderRef =
    resource.custom_id ||
    resource.custom ||
    payload.custom_id ||
    payload.summary?.match(/pp_[a-f0-9]+/)?.[0] ||
    null;

  const providerRef =
    resource.id ||
    resource.billing_agreement_id ||
    resource.subscription_id ||
    null;

  const email =
    resource.subscriber?.email_address ||
    resource.payer?.email_address ||
    resource.email_address ||
    null;

  const paidEvent =
    eventType === "PAYMENT.SALE.COMPLETED" ||
    eventType === "PAYMENT.CAPTURE.COMPLETED" ||
    eventType === "BILLING.SUBSCRIPTION.ACTIVATED" ||
    eventType === "BILLING.SUBSCRIPTION.RE-ACTIVATED";

  return { eventType, orderRef, providerRef, email, paidEvent };
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    if (!paymentDevMode()) {
      const valid = await verifyPaypalWebhook({ headers: request.headers, body: payload });
      if (!valid) {
        return NextResponse.json({ error: "Invalid PayPal webhook signature" }, { status: 401 });
      }
    }

    const { orderRef, providerRef, email, paidEvent, eventType } = parsePaypalEvent(payload);

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
        provider: "paypal",
        providerRef,
        planId: "pro",
        renewalWindowMs: planCatalog.pro.renewalWindowMs,
      });
    }

    return NextResponse.json({ ok: true, eventType, orderRef: orderRef || null });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }
}
