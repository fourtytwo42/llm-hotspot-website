# LLM Hotspot Website

Landing page + sales site for LLM Hotspot with:
- Free vs Pro pricing
- PayPal subscription checkout (`$5/month`)
- Coinbase Commerce crypto checkout (`$5` monthly renewal flow)
- Webhook-driven license key issuance
- Strict one-device activation claim lock
- Daily license status API for app heartbeat checks
- SMTP email notifications (purchase, due soon, expired)
- Daily reminder cron endpoint for GitHub Actions

## Stack
- Next.js App Router
- Plain CSS modules
- Server route handlers for payments/webhooks/licensing
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
ENDPOINTS_BASE_DOMAIN=llmhotspot.com
PROXY_RATE_LIMIT_WINDOW_MS=60000
PROXY_RATE_LIMIT_MAX=120
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

# SMTP
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="LLM Hotspot <noreply@example.com>"

# Cron auth
CRON_SECRET=...
ADMIN_API_KEY=...
```

`PAYMENT_DEV_MODE=true` disables webhook signature verification for local testing only.

## Routes

### Customer routes
- `/` landing page + checkout CTA
- `/download` app download information
- `/endpoints` self-serve endpoint manager (license key + device ID)
- `/success?provider=<paypal|coinbase>&ref=<orderRef>` post-checkout key delivery view

### API routes
- `POST /api/checkout/paypal`
- `POST /api/checkout/coinbase`
- `POST /api/webhooks/paypal`
- `POST /api/webhooks/coinbase`
- `GET /api/order-status/:orderRef`
- `POST /api/license/activate`
- `POST /api/license/status`
- `POST /api/endpoints/register`
- `POST /api/endpoints/details`
- `POST /api/endpoints/upstream`
- `POST /api/endpoints/token/rotate`
- `POST /api/jobs/license-reminders` (requires `CRON_SECRET`)
- `GET /api/admin/debug/licenses` (requires `ADMIN_API_KEY` or fallback `CRON_SECRET`)
- `https://<tenant-subdomain>.<ENDPOINTS_BASE_DOMAIN>/v1/*` (host-based multi-tenant proxy)

### Activation payload

```json
{
  "licenseKey": "LLMH-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "machine-uuid"
}
```

### Status payload

```json
{
  "licenseKey": "LLMH-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "machine-uuid"
}
```

## Reminder workflow

A GitHub Actions workflow is included at `.github/workflows/license-reminders.yml`.
Set repository secrets:
- `APP_BASE_URL`
- `CRON_SECRET`

The workflow triggers `POST /api/jobs/license-reminders` daily.

## Admin debug endpoint

Use this for operational visibility into license/order/notification state.

```bash
curl -sS \"${APP_BASE_URL}/api/admin/debug/licenses?limit=50&includeOrders=true\" \\
  -H \"Authorization: Bearer ${ADMIN_API_KEY}\"
```

## Production notes
- Replace file storage with a real DB before scale.
- Keep webhook and cron endpoints behind HTTPS.
- For strict recurring crypto billing, integrate a provider that supports native subscription billing for crypto.
- Use is subject to OpenAI and app provider terms.
- Multi-tenant endpoint routing runbook: `docs/multi-tenant-endpoints.md`
