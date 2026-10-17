import type { Metadata } from "next";
import Link from "next/link";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Second Opinion · Demo",
  description: "Fixture-backed investment pitch checks, Stock X-ray, and a mock payment hold.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={styles.body}>
    <header className={styles.header}><Link href="/">Second Opinion<span> / a moment to check</span></Link>
      <nav><Link href="/report/demo">Pitch check</Link><Link href="/xray/BRWT">Stock X-ray</Link><Link href="/bank">Demo bank</Link></nav>
    </header>
    <aside className={styles.notice}>Hackathon scaffold · fictional firm and ticker · fixture data · simulated payments</aside>
    <main className={styles.main}>{children}</main>
    <footer className={styles.footer}>A prompt to ask better questions. Demo checks provide no buy or sell advice.</footer>
  </body></html>;
}
