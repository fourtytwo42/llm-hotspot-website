import { cookies, headers } from "next/headers";

import { resolveTenantSlugFromHost } from "@/lib/tenant-routing";
import { verifyRemoteConsoleAccessKey } from "@/lib/store";

import ConsoleRedirectClient from "./console-redirect-client";
import styles from "./page.module.css";

const AUTH_COOKIE = "llmhotspot_remote_console_key";
const LOCAL_ADMIN_COOKIE = "llmhotspot_local_admin_key";

function deniedUi() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>LLM Hotspot</p>
        <h1>Remote Console Locked</h1>
        <p>This tenant console requires a valid `admin_key` in URL or cookie.</p>
      </section>
    </main>
  );
}

export default async function RemoteConsolePage({ searchParams }) {
  const host = (await headers()).get("host") || "";
  const slug = resolveTenantSlugFromHost(host);
  if (!slug) {
    return deniedUi();
  }

  const cookieStore = await cookies();
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const keyFromQuery = String(resolvedSearchParams?.admin_key || "").trim();
  const localAdminFromQuery = String(resolvedSearchParams?.local_admin_key || "").trim();
  const keyFromCookie = String(cookieStore.get(AUTH_COOKIE)?.value || "").trim();
  const localAdminFromCookie = String(cookieStore.get(LOCAL_ADMIN_COOKIE)?.value || "").trim();

  if (keyFromQuery) {
    const ok = await verifyRemoteConsoleAccessKey({ endpointSlug: slug, accessKey: keyFromQuery });
    if (!ok) return deniedUi();

    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>LLM Hotspot</p>
          <h1>Opening Local Console</h1>
          <p>Authorized remote console session.</p>
          <div className={styles.actions}>
            <a
              href={
                localAdminFromQuery
                  ? `http://localhost:11434/console?admin_key=${encodeURIComponent(localAdminFromQuery)}`
                  : "http://localhost:11434/console"
              }
            >
              Open Local Console
            </a>
            <a href="/endpoints">Open Endpoint Manager</a>
          </div>
          <ConsoleRedirectClient
            remoteAccessKey={keyFromQuery}
            localAdminKey={localAdminFromQuery}
          />
        </section>
      </main>
    );
  }

  if (keyFromCookie) {
    const ok = await verifyRemoteConsoleAccessKey({ endpointSlug: slug, accessKey: keyFromCookie });
    if (!ok) return deniedUi();

    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>LLM Hotspot</p>
          <h1>Opening Local Console</h1>
          <p>Authorized by stored remote-console cookie.</p>
          <div className={styles.actions}>
            <a
              href={
                localAdminFromCookie
                  ? `http://localhost:11434/console?admin_key=${encodeURIComponent(localAdminFromCookie)}`
                  : "http://localhost:11434/console"
              }
            >
              Open Local Console
            </a>
            <a href="/endpoints">Open Endpoint Manager</a>
          </div>
          <ConsoleRedirectClient
            remoteAccessKey={keyFromCookie}
            localAdminKey={localAdminFromCookie}
          />
        </section>
      </main>
    );
  }

  return deniedUi();
}
