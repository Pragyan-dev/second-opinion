"use client";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PaymentCheck, PaymentRequest } from "@/lib/contracts";
import styles from "../../styles.module.css";

export default function SendPage() {
  const [payee, setPayee] = useState("Brightwater demo");
  const [amount, setAmount] = useState("5000");
  const [report, setReport] = useState("demo");
  const [check, setCheck] = useState<PaymentCheck>();
  const [checkedRequest, setCheckedRequest] = useState<PaymentRequest>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [transfer, setTransfer] = useState("");
  useEffect(() => { setReport(new URLSearchParams(window.location.search).get("report") || "demo"); }, []);
  function reset() { setCheck(undefined); setCheckedRequest(undefined); setTransfer(""); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setTransfer("");
    const request: PaymentRequest = { customer_id: "demo", from_account_id: "checking-demo",
      payee_account_id: "brightwater-demo", payee_name: payee, amount: Number(amount), report_id: report };
    try { setCheck(await api<PaymentCheck>("/v1/payments/check", request)); setCheckedRequest(request); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!check || !checkedRequest) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ transfer_id: string }>("/v1/payments/execute", { ...checkedRequest, override_hold: check.hold_recommended });
      setTransfer(result.transfer_id); setCheck(undefined);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  return <><p className={styles.eyebrow}>Before you send / simulated payment</p><h1>Take a moment to check.</h1>
    <form className={styles.form} onSubmit={submit}>
      <label>Payee<input required value={payee} disabled={busy} onChange={e => { setPayee(e.target.value); reset(); }} /></label>
      <label>Amount (USD)<input required type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={e => { setAmount(e.target.value); reset(); }} /></label>
      <button disabled={busy}>{busy ? "Checking…" : "Check payment"}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {check && <section className={check.hold_recommended ? styles.hold : styles.card}>
      <h2>{check.hold_recommended ? "Cooling-off hold recommended" : "Payment check complete"}</h2>
      <p>Check level: {check.level}. This is a mock bank; every transfer is simulated.</p>
      <ul>{check.flags.map(flag => <li key={flag.id}><strong>{flag.label}</strong>: {flag.detail}</li>)}</ul>
      {check.hold_recommended && <p>Pause and independently confirm the recipient using the official contact from the fictional record.</p>}
      {check.official_contact?.phone && <p>Official contact: <a href={`tel:${check.official_contact.phone}`}>{check.official_contact.phone}</a></p>}
      <button disabled={busy} onClick={execute}>{check.hold_recommended ? "I understand, send anyway" : "Send demo payment"}</button>
    </section>}
    {transfer && <p role="status">Simulated transfer created: {transfer}</p>}
    {/* TODO(C): refine the hold screen; TODO(D): replace fixture payment rules in backend/app/bank/. */}
  </>;
}
