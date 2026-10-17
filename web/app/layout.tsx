import type { Metadata } from "next";
import Link from "next/link";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Second Opinion · Demo",
  description: "Fixture-backed fraud checks, stock research, and human-reviewed funding.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={styles.body}>
    <header className={styles.header}><Link href="/">Second Opinion<span> / a moment to check</span></Link>
      <nav><Link href="/fraud/clone-demo">Fraud check</Link><Link href="/stock/demo">Stock research</Link><Link href="/checkout/demo">Review preview</Link></nav>
    </header>
    <aside className={styles.notice}>Demo fixture data · synthetic captures · fictional BRWT · no live verification</aside>
    <main className={styles.main}>{children}</main>
    <footer className={styles.footer}>No order has been placed. Demo checks provide no buy or sell advice.</footer>
  </body></html>;
}
