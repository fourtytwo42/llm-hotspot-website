import { NextResponse } from "next/server";

import { createCoinbaseCharge } from "@/lib/coinbase";
import { getBaseUrl, paymentDevMode } from "@/lib/config";
import { createOrder, generateOrderRef } from "@/lib/store";

export async function POST(request) {
  try {
    const { email } = await request.json().catch(() => ({}));
    const orderRef = generateOrderRef("cb");
    const baseUrl = getBaseUrl();

    const now = new Date().toISOString();
    const order = {
      orderRef,
      provider: "coinbase",
      providerRef: null,
      status: "pending",
      planId: "pro",
      email: email || null,
      amountUsd: 5,
      recurring: false,
      createdAt: now,
      updatedAt: now,
      raw: null,
      licenseKeyIssued: false,
      paidAt: null,
    };

    await createOrder(order);

    const charge = await createCoinbaseCharge({
      orderRef,
      email,
      redirectUrl: `${baseUrl}/success?provider=coinbase&ref=${orderRef}`,
      cancelUrl: `${baseUrl}/?checkout=cancelled`,
    });

    return NextResponse.json({
      ok: true,
      orderRef,
      hostedUrl: charge.hosted_url,
      providerRef: charge.code,
      provider: "coinbase",
      recurringNote:
        "Coinbase Commerce flow is monthly renewal by re-checkout. PayPal supports automatic recurring billing.",
      debug: paymentDevMode() ? charge : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to create Coinbase checkout" },
      { status: 500 },
    );
  }
}
