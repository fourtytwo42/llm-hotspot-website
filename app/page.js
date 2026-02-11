"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const featureRows = [
  {
    label: "OpenAI account connections",
    free: "1",
    pro: "Unlimited",
  },
  {
    label: "Cloudflare Tunnel support",
    free: "No",
    pro: "Yes",
  },
  {
    label: "Internet-facing HTTPS endpoint",
    free: "No",
    pro: "Yes",
  },
  {
    label: "Webhook-based license key delivery",
    free: "N/A",
    pro: "Included",
  },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState("");
  const [error, setError] = useState("");

  async function beginCheckout(provider) {
    setError("");
    setCheckoutBusy(provider);

    try {
      const response = await fetch(`/api/checkout/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed");
      }

      const url = payload.approvalUrl || payload.hostedUrl;
      if (!url) throw new Error("Provider did not return redirect URL");
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setCheckoutBusy("");
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>LLM Hotspot</div>
        <nav className={styles.nav}>
          <a href="#pricing">Pricing</a>
          <a href="#features">Features</a>
          <Link href="/download">Download</Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>OpenAI-compatible gateway for your apps</p>
          <h1>Run your own LLM Hotspot endpoint in minutes.</h1>
          <p className={styles.subhead}>
            Connect once, expose a clean OpenAI-style API endpoint, and plug into apps that
            already support the OpenAI API standard.
          </p>
          <div className={styles.heroActions}>
            <a href="#pricing" className={styles.primaryCta}>
              Start Pro for $5/month
            </a>
            <Link href="/download" className={styles.secondaryCta}>
              Download Desktop App
            </Link>
          </div>
        </section>

        <section id="features" className={styles.featureBand}>
          <div>
            <h2>Built for practical local-to-cloud workflows</h2>
            <p>
              Free mode gives a single account connection. Pro unlocks unlimited account
              connections plus Cloudflare Tunnel support for a stable public HTTPS endpoint.
            </p>
          </div>
          <ul>
            <li>One-click account linking</li>
            <li>OpenAI API-compatible endpoint shape</li>
            <li>Webhook-issued license keys</li>
            <li>Activation endpoint for desktop unlock</li>
          </ul>
        </section>

        <section id="pricing" className={styles.pricingSection}>
          <h2>Simple pricing</h2>
          <div className={styles.cards}>
            <article className={styles.card}>
              <h3>Free</h3>
              <p className={styles.price}>$0</p>
              <p className={styles.caption}>Forever</p>
              <ul>
                <li>1 OpenAI account connection</li>
                <li>No Cloudflare Tunnel</li>
                <li>Local usage only</li>
              </ul>
              <Link href="/download" className={styles.cardButtonMuted}>
                Download Free
              </Link>
            </article>

            <article className={`${styles.card} ${styles.cardPrimary}`}>
              <p className={styles.badge}>Most Popular</p>
              <h3>Pro</h3>
              <p className={styles.price}>$5</p>
              <p className={styles.caption}>per month</p>
              <ul>
                <li>Unlimited OpenAI account connections</li>
                <li>Cloudflare Tunnel support</li>
                <li>HTTPS internet-facing endpoint</li>
                <li>Priority key issuance via webhooks</li>
              </ul>

              <label className={styles.emailLabel}>
                Buyer email (for support/recovery)
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                />
              </label>

              <div className={styles.payButtons}>
                <button
                  onClick={() => beginCheckout("paypal")}
                  disabled={checkoutBusy.length > 0}
                  className={styles.cardButton}
                >
                  {checkoutBusy === "paypal" ? "Opening PayPal..." : "Subscribe with PayPal"}
                </button>
                <button
                  onClick={() => beginCheckout("coinbase")}
                  disabled={checkoutBusy.length > 0}
                  className={styles.cardButtonMuted}
                >
                  {checkoutBusy === "coinbase"
                    ? "Opening Coinbase..."
                    : "Pay with Crypto (Coinbase)"}
                </button>
              </div>
              <p className={styles.smallPrint}>
                PayPal is automatic recurring billing. Coinbase Commerce checkout is paid monthly.
              </p>
              {error ? <p className={styles.error}>{error}</p> : null}
            </article>
          </div>

          <div className={styles.comparisonWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Pro</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.free}</td>
                    <td>{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>LLM Hotspot</p>
        <div>
          <Link href="/download">Download</Link>
          <span>•</span>
          <a href="mailto:support@llmhotspot.app">support@llmhotspot.app</a>
        </div>
      </footer>
    </div>
  );
}
