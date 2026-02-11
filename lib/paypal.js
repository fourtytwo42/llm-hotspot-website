import { getPaypalBaseUrl } from "./config";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function getPaypalAccessToken() {
  const clientId = requiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requiredEnv("PAYPAL_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal auth failed: ${text}`);
  }

  const json = await response.json();
  return json.access_token;
}

export async function createPaypalSubscription({
  planId,
  customId,
  returnUrl,
  cancelUrl,
  email,
}) {
  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${getPaypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: customId,
      subscriber: email ? { email_address: email } : undefined,
      application_context: {
        brand_name: "LLM Hotspot",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal create subscription failed: ${text}`);
  }

  return response.json();
}

export async function verifyPaypalWebhook({ headers, body }) {
  const webhookId = requiredEnv("PAYPAL_WEBHOOK_ID");
  const accessToken = await getPaypalAccessToken();

  const response = await fetch(
    `${getPaypalBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: body,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal webhook verification failed: ${text}`);
  }

  const json = await response.json();
  return json.verification_status === "SUCCESS";
}
