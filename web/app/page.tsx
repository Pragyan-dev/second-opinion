import Link from "next/link";
import styles from "./styles.module.css";

export default function Home() {
  return <>
    <p className={styles.eyebrow}>Second Opinion / Technica 2026</p>
    <h1>A moment to check.<br />A chance to ask.</h1>
    <p className={styles.intro}>Explore two simulated message checks, research a fictional stock, and review a funding preview that always waits for a human.</p>
    <div className={styles.grid}>
      <article className={styles.card}><h2>01 / Compare the messages</h2><p>See a low-concern sample and a fictional clone email.</p><p><Link href="/fraud/real-demo">Open ordinary post demo →</Link></p><Link href="/fraud/clone-demo">Open clone email demo →</Link></article>
      <article className={styles.card}><h2>02 / Research the stock</h2><p>Explore BRWT fixtures, articles, and questions.</p><Link href="/stock/demo">Open stock research →</Link></article>
      <article className={styles.card}><h2>03 / Review before acting</h2><p>Preview shares and explicitly approve simulated funding.</p><Link href="/checkout/demo">Open checkout preview →</Link></article>
    </div>
    {/* TODO(C): refine the three-act demo using the mock API. */}
  </>;
}
