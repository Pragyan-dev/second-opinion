"use client";
import Link from "next/link";
import { API_BASE, ApiError } from "@/lib/api";

export function NotFoundCopy() {
  return (
    <div className="errorBox" role="alert">
      <p>There&apos;s no report with that id. Start a new check from the extension, or open one of the demo reports.</p>
      <p className="small">
        <Link href="/fraud/real-demo">Real firm example</Link>{" "}<Link href="/fraud/clone-demo">Clone firm example</Link>{" "}
        <Link href="/stock/demo">Stock example</Link>
      </p>
    </div>
  );
}

export function JobError({ error, message, onRetry }: { error?: ApiError; message?: string; onRetry?: () => void }) {
  if (error?.status === 404) return <NotFoundCopy />;
  return (
    <div className="errorBox" role="alert">
      <p>
        We couldn&apos;t load this report. The API at {API_BASE} returned {error?.status ? error.status : "no response"}.
        Check the backend is running, then reload.
        {message ? ` ${message}` : error?.message && error.status ? ` (${error.message})` : ""}
      </p>
      <button type="button" className="btn" onClick={onRetry ?? (() => window.location.reload())}>Reload</button>
    </div>
  );
}

export function Stalled({ onKeepWaiting }: { onKeepWaiting: () => void }) {
  return (
    <div className="errorBox" role="status" style={{ borderColor: "var(--ochre)" }}>
      <p>This is taking longer than usual.</p>
      <button type="button" className="btn btnQuiet" onClick={onKeepWaiting}>Keep waiting</button>
    </div>
  );
}
