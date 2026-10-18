"use client";
import { useEffect, useState } from "react";
import type { OrderTicket } from "@/lib/contracts";
import { Toggle } from "@/components/shared/Toggle";
import styles from "./checkout.module.css";

const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.-]{0,11}$/;

interface Props {
  defaultSymbol: string; defaultPrice: number | null; busy: boolean; serverError: string;
  onEdit: () => void; onSubmit: (t: OrderTicket) => void;
}

export function OrderTicketForm({ defaultSymbol, defaultPrice, busy, serverError, onEdit, onSubmit }: Props) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("5");
  const [type, setType] = useState<"market" | "limit">("market");
  const [limit, setLimit] = useState("");
  const [tif, setTif] = useState<"gfd" | "gtc">("gfd");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { if (!touched && defaultSymbol) setSymbol(defaultSymbol); }, [defaultSymbol, touched]);

  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setTouched(true); onEdit(); };
  const sharesN = Number(shares), limitN = Number(limit);
  const errors = {
    symbol: SYMBOL_RE.test(symbol) ? "" : "Enter a stock symbol, such as BRWT",
    shares: shares.trim() !== "" && Number.isFinite(sharesN) && sharesN > 0 ? "" : "Enter a number of shares above 0",
    limit: type === "limit" && !(limit.trim() !== "" && Number.isFinite(limitN) && limitN > 0) ? "Enter a limit price above 0" : "",
  };
  const valid = !errors.symbol && !errors.shares && !errors.limit;

  function changeType(t: "market" | "limit") {
    edit(setType)(t);
    if (t === "limit" && !limit && defaultPrice != null) setLimit(String(Math.round(defaultPrice * 100) / 100));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || busy) return;
    onSubmit({
      symbol: symbol.toUpperCase(), side: "buy", quantity: sharesN, order_type: type,
      limit_price: type === "limit" ? limitN : null, time_in_force: tif,
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor="sym">Symbol</label>
        <input id="sym" className={styles.input} value={symbol} onChange={e => edit(setSymbol)(e.target.value.toUpperCase())}
          autoComplete="off" aria-invalid={submitted && !!errors.symbol} />
        {submitted && errors.symbol && <span className={styles.fieldError} role="alert">{errors.symbol}</span>}
      </div>
      <div className={styles.field}>
        <label htmlFor="shares">Shares</label>
        <input id="shares" className={styles.input} type="number" inputMode="decimal" min="0.000001" step="any" value={shares}
          onChange={e => edit(setShares)(e.target.value)} aria-invalid={submitted && !!errors.shares} />
        {submitted && errors.shares && <span className={styles.fieldError} role="alert">{errors.shares}</span>}
      </div>
      <div className={styles.field}>
        <span className="lbl">Order type</span>
        <Toggle label="Order type" value={type} onChange={changeType} options={[{ value: "market", label: "Market" }, { value: "limit", label: "Limit" }]} />
      </div>
      {type === "limit" && (
        <div className={styles.field}>
          <label htmlFor="limit">Limit price</label>
          <input id="limit" className={styles.input} type="number" inputMode="decimal" min="0.000001" step="any" value={limit}
            onChange={e => edit(setLimit)(e.target.value)} aria-invalid={submitted && !!errors.limit} />
          {submitted && errors.limit && <span className={styles.fieldError} role="alert">{errors.limit}</span>}
        </div>
      )}
      <div className={styles.field}>
        <span className="lbl">Time in force</span>
        <Toggle label="Time in force" value={tif} onChange={edit(setTif)} options={[{ value: "gfd", label: "Good for day" }, { value: "gtc", label: "Good till cancelled" }]} />
      </div>
      {serverError && <p className={styles.serverError} role="alert">{serverError}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Previewing…" : "Preview order"}</button>
    </form>
  );
}
