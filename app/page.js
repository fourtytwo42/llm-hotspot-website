"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
    label: "Account prioritization + routing",
    free: "No",
    pro: "Yes",
  },
  {
    label: "Usage visibility across linked accounts",
    free: "Basic",
    pro: "Advanced",
  },
];

const useCases = [
  "Connect desktop tools that already support the OpenAI API format.",
  "Reduce API spending by leveraging your ChatGPT subscription workflow.",
  "Route requests across multiple connected OpenAI accounts in Pro.",
  "Set priority order so critical workloads hit preferred accounts first.",
];

const CHAT_STORAGE_KEY = "llmhotspot:chat_state_v1";

export default function Home() {
  const [email, setEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState("");
  const [error, setError] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatName, setChatName] = useState("");
  const [chatEmail, setChatEmail] = useState("");
  const [chatStarted, setChatStarted] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setChatOpen(Boolean(parsed.chatOpen));
      setChatName(parsed.chatName || "");
      setChatEmail(parsed.chatEmail || "");
      setChatStarted(Boolean(parsed.chatStarted));
      setChatDraft(parsed.chatDraft || "");
      setChatMessages(Array.isArray(parsed.chatMessages) ? parsed.chatMessages : []);
    } catch {
      // Ignore local storage parse errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
          chatOpen,
          chatName,
          chatEmail,
          chatStarted,
          chatDraft,
          chatMessages,
        }),
      );
    } catch {
      // Ignore local storage write errors.
    }
  }, [chatOpen, chatName, chatEmail, chatStarted, chatDraft, chatMessages]);

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

  function startChat(event) {
    event.preventDefault();
    if (!chatName.trim() || !chatEmail.trim()) return;

    setChatStarted(true);
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          id: `system-${Date.now()}`,
          role: "system",
          text: `Thanks ${chatName.trim()}. Someone will be with you shortly.`,
        },
      ]);
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;

    setChatMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text,
      },
    ]);
    setChatDraft("");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Image src="/logo.png" alt="LLM Hotspot logo" width={32} height={32} className={styles.logoImage} />
          <span>LLM Hotspot</span>
        </div>
        <nav className={styles.nav}>
          <a href="#pricing">Pricing</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <Link href="/download">Download</Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>OpenAI-compatible gateway for your apps</p>
          <h1>Turn your ChatGPT login into a practical app-ready LLM endpoint.</h1>
          <p className={styles.subhead}>
            LLM Hotspot gives you a local OpenAI-style endpoint so apps can connect without custom
            adapters. Free covers one account. Pro unlocks multi-account pooling, prioritization,
            usage visibility, and Cloudflare Tunnel support.
          </p>
          <div className={styles.heroActions}>
            <a href="#pricing" className={styles.primaryCta}>
              Start Pro for $5/month
            </a>
            <Link href="/download" className={styles.secondaryCta}>
              Download Desktop App
            </Link>
          </div>
          <p className={styles.termsNote}>
            Use is subject to OpenAI and app provider terms.
          </p>
        </section>

        <section className={styles.useCaseBand}>
          <h2>What you can do with LLM Hotspot</h2>
          <ul>
            {useCases.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="features" className={styles.featureBand}>
          <div>
            <h2>Built for practical local-to-cloud workflows</h2>
            <p>
              Free mode gives a single account connection. Pro unlocks unlimited account
              connections plus Cloudflare Tunnel support for a stable public HTTPS endpoint and
              better cross-app integrations.
            </p>
          </div>
          <ul>
            <li>One-click account linking</li>
            <li>OpenAI API-compatible endpoint shape</li>
            <li>Multi-account priority routing in Pro</li>
            <li>Usage-aware operations for connected accounts</li>
          </ul>
        </section>

        <section id="how-it-works" className={styles.howItWorks}>
          <h2>How it works</h2>
          <ol>
            <li>Install LLM Hotspot on your machine.</li>
            <li>Connect one or more OpenAI accounts.</li>
            <li>Activate your Pro license key (if needed).</li>
            <li>Point OpenAI-compatible apps at your LLM Hotspot endpoint.</li>
          </ol>
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
                <li>Account priority + routing controls</li>
                <li>Cloudflare Tunnel support</li>
                <li>HTTPS internet-facing endpoint</li>
                <li>Recurring monthly billing</li>
              </ul>

              <label className={styles.emailLabel}>
                Buyer email (required for license delivery)
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
                PayPal supports automatic recurring billing. Coinbase Commerce flow is monthly
                renewal checkout.
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

      <div className={styles.chatWidget}>
        {chatOpen ? (
          <section className={styles.chatWidgetPanel}>
            <header className={styles.chatWidgetHeader}>
              <div className={styles.chatWidgetAgent}>
                <Image
                  src="/logo.png"
                  alt="LLM Hotspot assistant"
                  width={40}
                  height={40}
                  className={styles.chatWidgetAvatar}
                />
                <div>
                  <p>LLM Hotspot Assistant</p>
                  <small>Sales chat</small>
                </div>
              </div>
              <button
                type="button"
                className={styles.chatWidgetClose}
                onClick={() => setChatOpen(false)}
              >
                ✕
              </button>
            </header>

            {!chatStarted ? (
              <form className={styles.chatCard} onSubmit={startChat}>
                <label>
                  Name
                  <input
                    type="text"
                    value={chatName}
                    onChange={(event) => setChatName(event.target.value)}
                    placeholder="Your name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={chatEmail}
                    onChange={(event) => setChatEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <button className={styles.cardButton} type="submit">
                  Start Chat
                </button>
              </form>
            ) : (
              <div className={styles.chatCard}>
                <div className={styles.chatTranscript}>
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.chatBubble} ${
                        message.role === "user" ? styles.chatBubbleUser : styles.chatBubbleSystem
                      }`}
                    >
                      {message.text}
                    </div>
                  ))}
                </div>

                <form onSubmit={sendMessage} className={styles.chatComposer}>
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder="Type your message..."
                  />
                  <button className={styles.cardButton} type="submit">
                    Send
                  </button>
                </form>
              </div>
            )}
          </section>
        ) : (
          <button
            type="button"
            className={styles.chatWidgetBubble}
            onClick={() => setChatOpen(true)}
            aria-label="Open chat assistant"
            title="Open chat assistant"
          >
            <Image
              src="/logo.png"
              alt="LLM Hotspot assistant"
              width={40}
              height={40}
              className={styles.chatWidgetAvatar}
            />
          </button>
        )}
      </div>
    </div>
  );
}
