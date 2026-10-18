"use client";
import { useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import styles from "./live.module.css";

type LiveState = "starting" | "browsing" | "done" | "unavailable";
type LiveStatus = { state: LiveState; caption: string; url: string; reason: string };

const POLL_MS = 1000;

// Watch-only view of the agent's browser. The site runs on the agent's computer; this page only
// receives JPEG frames, and nothing here can click, type into, or link to the site.
export function LiveView({ reportId, running }: { reportId: string; running: boolean }) {
  const [status, setStatus] = useState<LiveStatus>();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await api<LiveStatus>(`/v1/fraud/${encodeURIComponent(reportId)}/live.json`, undefined, controller.signal);
        setStatus(next);
        const settled = next.state === "done" || (next.state === "unavailable" && !running);
        if (!settled) timer = setTimeout(poll, POLL_MS);
      } catch {
        if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS * 3);
      }
    }
    poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [reportId, running]);

  const state = status?.state;
  const live = state === "starting" || state === "browsing";
  if (!status || (state === "unavailable" && !running) || (state === "done" && imageFailed)) return null;

  const base = `${API_BASE}/v1/fraud/${encodeURIComponent(reportId)}`;
  const src = live ? `${base}/live.mjpg` : state === "done" ? `${base}/preview.jpg` : null;

  return (
    <section className={`band ${styles.wrap}`} aria-labelledby="live-title">
      <div className={styles.head}>
        <div>
          <h2 id="live-title">The agent&apos;s browser</h2>
          <p className={styles.sub}>
            Second Opinion opened the link on its own computer, so you don&apos;t have to.
            You are seeing pictures of the site, not the site itself: nothing here can be clicked.
          </p>
        </div>
        <span className={`${styles.badge} ${live ? styles.badgeLive : ""}`}>
          {live && <span className={styles.dot} aria-hidden="true" />}
          {live ? "Live · view only" : state === "done" ? "Snapshot" : "Waiting"}
        </span>
      </div>

      <figure className={styles.window}>
        <div className={styles.chrome} aria-hidden="true">
          <span className={styles.lights}><i /><i /><i /></span>
          <span className={styles.address}>{status.url || "Waiting for the link"}</span>
        </div>
        <div className={styles.viewport}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- MJPEG streams need a plain img
            <img key={src} className={styles.frame} src={src} alt={`Screenshot of ${status.url || "the linked site"}, taken by Second Opinion`}
              draggable={false} onError={() => { if (state === "done") setImageFailed(true); }} />
          ) : (
            <div className={styles.placeholder}>The agent will open the link as soon as the site has been checked.</div>
          )}
          {/* Swallows every pointer event so the picture can't be clicked, dragged or saved by accident. */}
          <div className={styles.shield} aria-hidden="true" onContextMenu={e => e.preventDefault()} />
          <span className={styles.stamp} aria-hidden="true">Pictures only · not clickable</span>
        </div>
        <figcaption className={styles.caption} aria-live="polite">
          {status.caption || status.reason}
        </figcaption>
      </figure>
    </section>
  );
}
