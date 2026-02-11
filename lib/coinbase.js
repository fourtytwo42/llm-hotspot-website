import crypto from "node:crypto";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createCoinbaseCharge({ orderRef, email, redirectUrl, cancelUrl }) {
  const apiKey = requiredEnv("COINBASE_COMMERCE_API_KEY");
  const response = await fetch("https://api.commerce.coinbase.com/charges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Version": "2018-03-22",
      "X-CC-Api-Key": apiKey,
    },
    body: JSON.stringify({
      name: "LLM Hotspot Pro",
      description: "$5/month plan. Crypto renewals are paid monthly.",
      pricing_type: "fixed_price",
      local_price: {
        amount: "5.00",
        currency: "USD",
      },
      metadata: {
        orderRef,
        email: email || "",
        plan: "pro",
      },
      redirect_url: redirectUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Coinbase charge creation failed: ${text}`);
  }

  const json = await response.json();
  return json.data;
}

export function verifyCoinbaseWebhookSignature(rawBody, signatureHeader) {
  const sharedSecret = requiredEnv("COINBASE_WEBHOOK_SHARED_SECRET");
  if (!signatureHeader) return false;

  const computed = crypto
    .createHmac("sha256", sharedSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(signatureHeader, "utf8"),
    );
  } catch {
    return false;
  }
}
