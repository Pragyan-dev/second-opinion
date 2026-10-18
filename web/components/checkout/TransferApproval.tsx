"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { FundingRequest } from "@/lib/contracts";
import { dollars } from "@/lib/format";
import styles from "./checkout.module.css";

export const NESSIE = {
  customer: process.env.NEXT_PUBLIC_NESSIE_CUSTOMER_ID || "68395a5e-076e-49fe-ba22-a1c86daf2d2b",
  from: process.env.NEXT_PUBLIC_NESSIE_FROM_ACCOUNT_ID || "a04e20c2-440e-4743-bb2c-9a436f303fa1",
  to: process.env.NEXT_PUBLIC_NESSIE_TO_ACCOUNT_ID || "02cb4b23-cf32-47df-9b85-d68b4aba25e5",
};

interface Props { amount: number; emphasised: boolean; transferId: string; onDone: (id: string) => void }

export function TransferApproval({ amount, emphasised, transferId, onDone }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = !(amount > 0);

  async function move() {
    if (busy || transferId) return;
    setBusy(true); setError("");
    const body: FundingRequest = { customer_id: NESSIE.customer, from_account_id: NESSIE.from, to_account_id: NESSIE.to, amount, human_confirmed: true };
    try {
      const r = await api<{ transfer_id: string }>("/v1/purchase/fund", body);
      onDone(r.transfer_id); setConfirming(false);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      setError(e ? `${e.status ? `Error ${e.status}: ` : ""}${e.message}` : String(err));
    } finally { setBusy(false); }
  }

  if (transferId) return <p role="status">Transfer approved. Sandbox transfer {transferId}.</p>;
  return (
    <div className={`${styles.sig} ${emphasised ? styles.sigEmphasis : ""}`}>
      {emphasised && <p><strong>Buying power is short for this order.</strong> You can move sandbox money from checking first.</p>}
      {!confirming ? (
        <div className={styles.row}>
          <button type="button" className="btn" disabled={blocked} onClick={() => setConfirming(true)}>Approve transfer</button>
          {blocked && <span className="small muted">The estimated total is $0, so there is nothing to move.</span>}
        </div>
      ) : (
        <div className={styles.confirmBox} role="group" aria-label="Confirm transfer">
          <p>Move {dollars(amount)} from Second Opinion Demo Checking to Second Opinion Demo Brokerage? This is Nessie sandbox money.</p>
          <div className={styles.row}>
            <button type="button" className="btn" disabled={busy} onClick={move}>{busy ? "Moving…" : "Move sandbox money"}</button>
            <button type="button" className="btn btnQuiet" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className={styles.serverError} role="alert">{error}</p>}
      <p className="tiny muted">Signature: you, not Second Opinion.</p>
    </div>
  );
}
