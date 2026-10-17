"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, BankSummary, dollars } from "@/lib/api";
import styles from "../styles.module.css";

export default function BankPage() {
  const [data, setData] = useState<BankSummary>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<BankSummary>("/v1/bank/demo/summary", undefined, controller.signal).then(setData).catch(err => {
      if (!controller.signal.aborted) setError(String(err));
    });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  return <><p className={styles.eyebrow}>Mock bank / Nessie fixture</p><h1>Your demo accounts.</h1>
    <p>{data ? `Welcome, ${data.customer.first_name}. Snapshot as of ${data.reference_date}.` : "Loading…"}</p>
    <div className={styles.grid}>{data?.accounts.map(account => <article className={styles.card} key={account.id}>
      <h2>{account.nickname}</h2><strong>{dollars(account.balance)}</strong><p>{account.type}</p>
    </article>)}</div>
    <Link className={styles.button} href="/bank/send?report=demo">Try a payment check →</Link>
    <h2>Last 30 transactions</h2>
    <table className={styles.table}><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody>{data?.transactions.map(tx => <tr key={tx.id}><td>{tx.date}</td><td>{tx.description}</td><td>{dollars(tx.amount)}</td></tr>)}</tbody>
    </table>
  </>;
}
