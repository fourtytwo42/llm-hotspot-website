# LLM Hotspot Website

Landing page + sales site for LLM Hotspot with:
- Free vs Pro pricing
- PayPal subscription checkout (`$5/month`)
- Coinbase Commerce crypto checkout (`$5` monthly renewal flow)
- Webhook-driven license key issuance
- License activation API for the desktop app

## Stack
- Next.js App Router
- Plain CSS modules
- Server route handlers for payments/webhooks
- File-backed JSON store at `data/store.json`

## Local setup

```bash
npm install
npm run dev
```

## Environment variables

Create `.env.local`:

```bash
APP_BASE_URL=http://localhost:3000
PAYMENT_DEV_MODE=true

# PayPal
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_PLAN_ID=...
PAYPAL_WEBHOOK_ID=...

# Coinbase Commerce
COINBASE_COMMERCE_API_KEY=...
COINBASE_WEBHOOK_SHARED_SECRET=...
```

`PAYMENT_DEV_MODE=true` disables webhook signature verification for local testing only.

## Routes

### Customer routes
- `/` landing page + checkout CTA
- `/download` app download/activation info
- `/success?provider=<paypal|coinbase>&ref=<orderRef>` post-checkout key delivery view

### API routes
- `POST /api/checkout/paypal`
- `POST /api/checkout/coinbase`
- `POST /api/webhooks/paypal`
- `POST /api/webhooks/coinbase`
- `GET /api/order-status/:orderRef`
- `POST /api/license/activate`

### License activation payload

```json
{
  "licenseKey": "LLMH-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "machine-uuid"
}
```

## Production notes
- Replace file storage with a real DB before scale.
- Add email delivery for keys (SES/Postmark/Resend).
- Keep webhook endpoints behind HTTPS only.
- For strict recurring crypto billing, integrate a provider that supports native subscription billing for crypto.
