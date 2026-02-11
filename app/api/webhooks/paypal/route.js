import { NextResponse } from "next/server";

import { paymentDevMode, planCatalog } from "@/lib/config";
import { sendPurchaseEmail } from "@/lib/email";
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
      const updatedOrder = await updateOrder(orderRef, (order) => ({
        ...order,
        status: "paid",
        providerRef: providerRef || order.providerRef,
        email: email || order.email,
        updatedAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        raw: payload,
      }));

      const buyerEmail = email || updatedOrder?.email || null;
      if (!buyerEmail) {
        await updateOrder(orderRef, (order) => ({
          ...order,
          status: "paid_email_missing",
          updatedAt: new Date().toISOString(),
        }));
        return NextResponse.json({ ok: true, eventType, orderRef, warning: "missing_email" });
      }

      const licenseResult = await issueOrRenewLicense({
        orderRef,
        email: buyerEmail,
        provider: "paypal",
        providerRef,
        planId: "pro",
        renewalWindowMs: planCatalog.pro.renewalWindowMs,
      });

      if (!licenseResult.ok) {
        await updateOrder(orderRef, (order) => ({
          ...order,
          status: "license_issue_failed",
          updatedAt: new Date().toISOString(),
        }));

        return NextResponse.json(
          { ok: false, error: licenseResult.error || "license_issue_failed" },
          { status: 400 },
        );
      }

      await updateOrder(orderRef, (order) => ({
        ...order,
        licenseKeyIssued: true,
        updatedAt: new Date().toISOString(),
      }));

      await sendPurchaseEmail({
        email: buyerEmail,
        licenseKey: licenseResult.license.licenseKey,
        expiresAt: licenseResult.license.expiresAt,
        provider: "paypal",
      });
    }

    return NextResponse.json({ ok: true, eventType, orderRef: orderRef || null });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 },
    );
  }
}
