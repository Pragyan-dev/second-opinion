import type { OrderPreview, OrderTicket } from "@/lib/contracts";
import { dollars, dollarsInWords } from "@/lib/format";
import { TradeChecks } from "./TradeChecks";
import { TransferApproval } from "./TransferApproval";
import styles from "./checkout.module.css";

const SOURCE_LABEL: Record<string, string> = { robinhood_mcp: "Robinhood preview", cached: "Cached quote", simulated: "Simulated quote" };

export function PreviewSlip({ preview, ticket, transferId, onTransfer }: {
  preview: OrderPreview | undefined; ticket: OrderTicket | undefined; transferId: string; onTransfer: (id: string) => void;
}) {
  if (!preview || !ticket) {
    return (
      <div className={styles.chequeEmpty}>
        <p className="num" style={{ fontSize: "var(--s3)" }}>No preview yet</p>
        <p>Fill in the order and choose Preview order. The slip appears here.</p>
      </div>
    );
  }
  const type = ticket.order_type === "limit" && ticket.limit_price != null ? `limit ${dollars(ticket.limit_price)}` : "market order";
  const qty = `${ticket.quantity} ${ticket.quantity === 1 ? "share" : "shares"}`;
  return (
    <section className={styles.cheque} aria-label="Order preview">
      <div className={styles.chequeTop}>
        <div>
          <h2 style={{ fontSize: "var(--s3)" }}>{preview.name}</h2>
          <p className="muted">{preview.symbol}</p>
        </div>
        <span className={styles.stamp}>{SOURCE_LABEL[preview.data_source] ?? preview.data_source}</span>
      </div>
      <div className={styles.payee}><span className="small">Pay to</span>Your brokerage account</div>
      <p>
        Last price <span className="num" style={{ fontSize: "var(--s3)" }}>{dollars(preview.last_price)}</span>
        <br />{qty}, {type}, {ticket.time_in_force === "gtc" ? "good till cancelled" : "good for day"}
      </p>
      <div className={styles.amountRow}>
        <span className="small muted">{ticket.order_type === "limit" ? "Estimated total at the limit price" : "Estimated total"}</span>
        <span className={styles.amount}>{dollars(preview.est_total)}</span>
        <span className={styles.words}>{dollarsInWords(preview.est_total)}</span>
      </div>
      <TradeChecks tradable={preview.tradable} buyingPowerOk={preview.buying_power_ok} />
      {(preview.warnings?.length ?? 0) > 0 && (
        <ul className={styles.warnings}>
          {preview.warnings!.map((w, i) => (
            <li key={i}><span className="check check-warn" aria-hidden="true">!</span><span><span className="sr-only">Warning: </span>{w}</span></li>
          ))}
        </ul>
      )}
      <p><strong>Status:</strong> {preview.status === "awaiting_human" ? "Waiting for you" : "Preview only"}</p>
      <TransferApproval amount={preview.est_total} emphasised={preview.buying_power_ok === false} transferId={transferId} onDone={onTransfer} />
      {transferId && <span className={`${styles.stamp} ${styles.stampApproved}`}>Transfer approved</span>}
    </section>
  );
}
