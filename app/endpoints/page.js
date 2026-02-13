"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

const emptyForm = {
  licenseKey: "",
  deviceId: "",
  slug: "",
};

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || data.reason || "Request failed");
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(url, { method: "GET" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || data.reason || "Request failed");
  }
  return data;
}

export default function EndpointsPage() {
  const [form, setForm] = useState(emptyForm);
  const [endpoint, setEndpoint] = useState(null);
  const [latestToken, setLatestToken] = useState("");
  const [connectorToken, setConnectorToken] = useState("");
  const [connectorStatus, setConnectorStatus] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const managerAuth = useMemo(
    () => ({ licenseKey: form.licenseKey.trim(), deviceId: form.deviceId.trim() }),
    [form.deviceId, form.licenseKey],
  );

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function run(action) {
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(error.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Endpoint Manager</h1>
        <p>Create and manage your unique LLM Hotspot endpoint URL.</p>

        <div className={styles.grid}>
          <label>
            License Key
            <input
              value={form.licenseKey}
              onChange={(e) => setField("licenseKey", e.target.value)}
              placeholder="LLMH-XXXX-XXXX-XXXX-XXXX"
            />
          </label>
          <label>
            Device ID
            <input
              value={form.deviceId}
              onChange={(e) => setField("deviceId", e.target.value)}
              placeholder="machine-uuid"
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const data = await postJson("/api/endpoints/details", managerAuth);
                setEndpoint(data.endpoint);
                setStatus(data.endpoint ? "Endpoint loaded" : "No endpoint exists yet");
              })
            }
          >
            Load Endpoint
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Create Endpoint</h2>
        <div className={styles.grid}>
          <label>
            Subdomain Slug
            <input
              value={form.slug}
              onChange={(e) => setField("slug", e.target.value)}
              placeholder="acme"
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const data = await postJson("/api/endpoints/register", {
                  ...managerAuth,
                  slug: form.slug.trim(),
                });
                setEndpoint(data.endpoint);
                setLatestToken(data.endpointToken || "");
                setStatus("Endpoint created");
              })
            }
          >
            Create Endpoint
          </button>
        </div>
      </section>

      {endpoint ? (
        <section className={styles.card}>
          <h2>Current Endpoint</h2>
          <p>
            URL: <code>{endpoint.publicBaseUrl}</code>
          </p>
          <p>
            Relay status: <code>{endpoint.relayStatus || "offline"}</code>
          </p>

          <div className={styles.actions}>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const data = await postJson("/api/connectors/issue", {
                    ...managerAuth,
                    endpointSlug: endpoint.slug,
                  });
                  setConnectorToken(data.connectorToken || "");
                  setStatus("Connector session issued");
                })
              }
            >
              Issue Connector Session
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const data = await postJson("/api/endpoints/token/rotate", managerAuth);
                  setEndpoint(data.endpoint);
                  setLatestToken(data.endpointToken || "");
                  setStatus("Endpoint token rotated");
                })
              }
            >
              Rotate Token
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const data = await getJson(`/api/connectors/status?slug=${endpoint.slug}`);
                  setConnectorStatus(data.connector);
                  setStatus("Connector status loaded");
                })
              }
            >
              Refresh Connector Status
            </button>
          </div>

          {latestToken ? (
            <div className={styles.tokenBox}>
              <p>New token (save now):</p>
              <code>{latestToken}</code>
            </div>
          ) : null}

          {connectorToken ? (
            <div className={styles.tokenBox}>
              <p>Connector token (desktop daemon uses this to connect relay):</p>
              <code>{connectorToken}</code>
            </div>
          ) : null}

          {connectorStatus ? (
            <div className={styles.tokenBox}>
              <p>Connector status</p>
              <code>{JSON.stringify(connectorStatus)}</code>
            </div>
          ) : null}
        </section>
      ) : null}

      {status ? <p className={styles.status}>{status}</p> : null}
    </main>
  );
}
