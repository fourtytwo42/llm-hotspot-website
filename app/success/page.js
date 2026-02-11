import { Suspense } from "react";

import styles from "./page.module.css";
import SuccessContent from "./success-content";

export default function SuccessPage() {
  return (
    <main className={styles.page}>
      <Suspense fallback={<section className={styles.card}>Loading checkout status...</section>}>
        <SuccessContent />
      </Suspense>
    </main>
  );
}
