import { NextResponse } from "next/server";

import { getBaseUrl, paymentDevMode } from "@/lib/config";
import { createPaypalSubscription } from "@/lib/paypal";
import { createOrder, generateOrderRef } from "@/lib/store";

export async function POST(request) {
  try {
    const { email } = await request.json().catch(() => ({}));
    const orderRef = generateOrderRef("pp");
    const baseUrl = getBaseUrl();
    const planId = process.env.PAYPAL_PLAN_ID;

    if (!planId) {
      return NextResponse.json(
        { error: "PAYPAL_PLAN_ID is not configured" },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();
    const order = {
      orderRef,
      provider: "paypal",
      providerRef: null,
      status: "pending",
      planId: "pro",
      email: email || null,
      amountUsd: 5,
      recurring: true,
      createdAt: now,
      updatedAt: now,
      raw: null,
      licenseKeyIssued: false,
      paidAt: null,
    };

    await createOrder(order);

    const subscription = await createPaypalSubscription({
      planId,
      customId: orderRef,
      returnUrl: `${baseUrl}/success?provider=paypal&ref=${orderRef}`,
      cancelUrl: `${baseUrl}/?checkout=cancelled`,
      email,
    });

    const approvalUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
    if (!approvalUrl) {
      throw new Error("PayPal did not return approval URL");
    }

    return NextResponse.json({
      ok: true,
      orderRef,
      approvalUrl,
      provider: "paypal",
      debug: paymentDevMode() ? subscription : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to create PayPal checkout" },
      { status: 500 },
    );
  }
}
