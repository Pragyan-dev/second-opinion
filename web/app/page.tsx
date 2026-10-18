"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { RosetteGlyph } from "@/components/shared/RosetteGlyph";
import styles from "./home.module.css";

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.-]{0,11}$/;

export default function Home() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function research(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const s = symbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(s)) { setError("Enter a stock symbol of 1 to 12 characters, such as BRWT"); return; }
    setBusy(true); setError("");
    try {
      const r = await api<{ research_id: string }>("/v1/stock/research", { symbol: s, source_url: null });
      router.push(`/stock/${encodeURIComponent(r.research_id)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err)); setBusy(false);
    }
  }

  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.pitch}>
          Check the pitch before you believe it. Research the stock before you buy it. The final click is yours.
        </h1>
        <div className={styles.ornament} aria-hidden="true"><RosetteGlyph size={220} rings={14} seed="home" /></div>
      </section>

      <ol className={styles.acts}>
        <li>
          <h2>Check a message</h2>
          <p className="muted">See how a genuine firm and a clone firm look side by side.</p>
          <p><Link href="/fraud/real-demo">T. Rowe Price post (low)</Link></p>
          <p><Link href="/fraud/clone-demo">Brightwater email (high)</Link></p>
        </li>
        <li>
          <h2>Research a stock</h2>
          <p className="muted">Price history, how much it moves, red flags and sourced coverage.</p>
          <p><Link href="/stock/demo">BRWT report</Link></p>
          <form onSubmit={research} className={styles.symbolForm} noValidate>
            <label htmlFor="research-symbol">Research a symbol</label>
            <div className={styles.symbolRow}>
              <input id="research-symbol" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12}
                autoComplete="off" aria-invalid={!!error} aria-describedby={error ? "research-error" : undefined} />
              <button className="btn" type="submit" disabled={busy}>{busy ? "Starting…" : "Research"}</button>
            </div>
            {error && <p id="research-error" role="alert" className={styles.err}>{error}</p>}
          </form>
        </li>
        <li>
          <h2>Preview an order</h2>
          <p className="muted">Review the ticket and approve a sandbox transfer yourself.</p>
          <p><Link href="/checkout/demo">Open the order preview</Link></p>
        </li>
      </ol>
      <p className="muted" style={{ marginTop: 40 }}>Second Opinion previews orders but can&apos;t place them.</p>
    </>
  );
}
