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
      <section className={styles.hero} aria-labelledby="waiting-title">
        <div>
          <p className={styles.status}><span className={styles.dot} aria-hidden="true" />Waiting for a capture</p>
          <h1 id="waiting-title" className={styles.pitch}>No report yet.</h1>
          <p className={styles.lead}>
            Open an email, an X post or a website, then click <strong>Analyze</strong> in the Second Opinion
            extension. The checks run in the background and the report opens here.
          </p>
        </div>
        <div className={styles.ornament} aria-hidden="true"><RosetteGlyph size={220} rings={14} seed="home" /></div>
      </section>

      <ol className={styles.acts}>
        <li>
          <h2>Capture</h2>
          <p className="muted">The extension reads only what is visible: the open email, the selected post or the page.</p>
        </li>
        <li>
          <h2>Check</h2>
          <p className="muted">Agents visit the linked site, compare contacts with the official record, check the domain age and score pressure language.</p>
        </li>
        <li>
          <h2>Report</h2>
          <p className="muted">The fraud report fills in step by step, with sources for every finding. On a stock page, the research report opens the same way.</p>
        </li>
      </ol>

      <details className={styles.demo}>
        <summary>Try without the extension</summary>
        <div className={styles.demoBody}>
          <div>
            <h2>Demo reports</h2>
            <p><Link href="/fraud/real-demo">T. Rowe Price post (low)</Link></p>
            <p><Link href="/fraud/clone-demo">Brightwater email (high)</Link></p>
            <p><Link href="/stock/demo">BRWT stock report</Link></p>
            <p><Link href="/checkout/demo">Order preview</Link></p>
          </div>
          <form onSubmit={research} className={styles.symbolForm} noValidate>
            <label htmlFor="research-symbol">Research a symbol</label>
            <div className={styles.symbolRow}>
              <input id="research-symbol" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12}
                autoComplete="off" aria-invalid={!!error} aria-describedby={error ? "research-error" : undefined} />
              <button className="btn" type="submit" disabled={busy}>{busy ? "Starting…" : "Research"}</button>
            </div>
            {error && <p id="research-error" role="alert" className={styles.err}>{error}</p>}
          </form>
        </div>
      </details>
      <p className="muted" style={{ marginTop: 40 }}>Second Opinion previews orders but can&apos;t place them.</p>
    </>
  );
}
