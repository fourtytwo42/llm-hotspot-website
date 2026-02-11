import Link from "next/link";
import styles from "./page.module.css";

export default function DownloadPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>LLM Hotspot Desktop</p>
        <h1>Download and get started in free mode</h1>
        <p>
          Free mode includes one OpenAI account connection and local endpoint usage. Upgrade to
          Pro for unlimited account connections and Cloudflare Tunnel support.
        </p>

        <div className={styles.actions}>
          <a className={styles.button} href="#" aria-disabled="true">
            Download for macOS (coming soon)
          </a>
          <a className={styles.button} href="#" aria-disabled="true">
            Download for Windows (coming soon)
          </a>
          <a className={styles.button} href="#" aria-disabled="true">
            Download for Linux (coming soon)
          </a>
        </div>

        <div className={styles.apiBox}>
          <h2>License activation endpoint for app unlock</h2>
          <pre>{`POST /api/license/activate\n{\n  "licenseKey": "LLMH-XXXX-XXXX-XXXX-XXXX",\n  "deviceId": "machine-uuid"\n}`}</pre>
        </div>

        <Link href="/" className={styles.link}>
          Back to pricing
        </Link>
      </section>
    </main>
  );
}
