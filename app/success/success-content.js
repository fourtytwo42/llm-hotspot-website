"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

export default function SuccessContent() {
  const params = useSearchParams();
  const ref = params.get("ref") || "";
  const provider = params.get("provider") || "";
  const [status, setStatus] = useState("pending");
  const [license, setLicense] = useState(null);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (status === "paid" && license?.key) return "Payment received. Your key is ready.";
    if (error) return "Unable to fetch order status.";
    return "Finishing your purchase...";
  }, [status, license, error]);

  useEffect(() => {
    if (!ref) return;

    let pollId;
    let cancelled = false;

    async function fetchStatus() {
      try {
        const response = await fetch(`/api/order-status/${ref}`, { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Order lookup failed");
        }

        if (cancelled) return;

        setStatus(payload.order.status);
        setLicense(payload.license);

        if (payload.order.status !== "paid") {
          pollId = setTimeout(fetchStatus, 3000);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
      clearTimeout(pollId);
    };
  }, [ref]);

  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Checkout result</p>
      <h1>{title}</h1>
      <p className={styles.meta}>
        Provider: <strong>{provider || "unknown"}</strong> • Ref: <strong>{ref || "missing"}</strong>
      </p>

      {status !== "paid" && !error ? (
        <p className={styles.waiting}>Waiting for webhook confirmation. This page updates automatically.</p>
      ) : null}

      {license?.key ? (
        <div className={styles.keyBox}>
          <p className={styles.keyLabel}>Your Pro key</p>
          <code>{license.key}</code>
          <p>Expires: {new Date(license.expiresAt).toLocaleString()}</p>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Link href="/download" className={styles.button}>
          Go to Download + Activation
        </Link>
        <Link href="/" className={styles.link}>
          Back to home
        </Link>
      </div>
    </section>
  );
}
