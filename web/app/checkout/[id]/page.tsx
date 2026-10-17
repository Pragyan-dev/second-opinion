"use client";
import { useEffect, useState } from "react";
import { api, dollars } from "@/lib/api";
import type { FundingRequest, OrderPreview, OrderTicket, StockReport } from "@/lib/contracts";
import { useJob } from "@/lib/useJob";
import styles from "../../styles.module.css";

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const { data, error: stockError } = useJob<StockReport>(`/v1/stock/${encodeURIComponent(params.id)}`);
  const [shares, setShares] = useState("10"), [preview, setPreview] = useState<OrderPreview>();
  const [error, setError] = useState(""), [transfer, setTransfer] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(undefined); setTransfer(""); setError("");
    if (data?.status !== "done" || !Number.isFinite(Number(shares)) || Number(shares) <= 0) return;
    const ticket: OrderTicket = { symbol: data.symbol, quantity: Number(shares), order_type: "market", research_id: params.id };
    api<OrderPreview>("/v1/purchase/preview", ticket, controller.signal).then(setPreview).catch(err => {
      if (!controller.signal.aborted) setError(String(err));
    });
    return () => controller.abort();
  }, [data?.symbol, data?.status, shares, params.id]);
  async function approveTransfer() {
    if (!preview || transfer || busy) return;
    setBusy(true); setError("");
    const request: FundingRequest = { customer_id: "demo", from_account_id: "checking-demo",
      to_account_id: "investment-demo", amount: preview.est_total, human_confirmed: true };
    try {
      const result = await api<{ transfer_id: string }>("/v1/purchase/fund", request);
      setTransfer(result.transfer_id);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  return <><p className={styles.eyebrow}>Checkout / human review only</p><h1>Review before acting.</h1>
    {(error || stockError) && <p role="alert" className={styles.error}>{error || stockError}</p>}
    <label className={styles.form}>Shares<input type="number" min="0.01" step="0.01" value={shares} disabled={busy} onChange={e => { setPreview(undefined); setTransfer(""); setShares(e.target.value); }} /></label>
    <section className={styles.card}><h2>{preview?.name || "Loading preview…"}</h2>
      <p>Price: {preview ? dollars(preview.last_price) : "Pending"}</p><p>Shares: {shares}</p>
      <p>Estimated total: {preview ? dollars(preview.est_total) : "Pending"}</p>
      <p>Status: {preview?.status || "Pending"} · Data source: {preview?.data_source || "Pending"}</p>
      <ul>{preview?.warnings?.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </section>
    <p>Approve transfer simulates funding only. Review the amount above before confirming.</p>
    <button disabled={!preview || busy || !!transfer} onClick={approveTransfer}>Approve transfer</button>{" "}
    <button disabled>Place this order yourself in Robinhood</button>
    {transfer && <p role="status">Simulated transfer: {transfer}</p>}
    <p>No order has been placed.</p>
    {/* TODO(C): refine human review; TODO(D): integrate confirmed Nessie funding separately. */}
  </>;
}
