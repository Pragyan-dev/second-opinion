import Link from "next/link";
import styles from "./styles.module.css";

export default function Home() {
  return <>
    <p className={styles.eyebrow}>Second Opinion / Technica 2026</p>
    <h1>Before the pitch<br />becomes a payment.</h1>
    <p className={styles.intro}>Pause, check the details, and find the questions worth asking. Explore a fictional investment pitch and a mock payment check.</p>
    <div className={styles.grid}>
      <article className={styles.card}><h2>01 / Check the pitch</h2><p>Compare the page with a fictional official record.</p><Link href="/report/demo">Open demo report →</Link></article>
      <article className={styles.card}><h2>02 / Look at the stock</h2><p>Explore BRWT fixture data and questions before buying.</p><Link href="/xray/BRWT">Open Stock X-ray →</Link></article>
      <article className={styles.card}><h2>03 / Pause the payment</h2><p>See balances, demo activity, and a cooling-off hold.</p><Link href="/bank">Open demo bank →</Link></article>
    </div>
    {/* TODO(C): iterate on the landing page inside web/ against the mock API. */}
  </>;
}
