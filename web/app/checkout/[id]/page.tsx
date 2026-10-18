"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { OrderPreview, OrderTicket, StockReport } from "@/lib/contracts";
import { readMarket } from "@/lib/sections";
import { useJob } from "@/lib/useJob";
import { JobError } from "@/components/shared/JobError";
import { FinalHandoff } from "@/components/checkout/FinalHandoff";
import { LinkedReports } from "@/components/checkout/LinkedReports";
import { OrderTicketForm } from "@/components/checkout/OrderTicketForm";
import { PreviewSlip } from "@/components/checkout/PreviewSlip";
import styles from "@/components/checkout/checkout.module.css";

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const { data, error: stockError, retry } = useJob<StockReport>(`/v1/stock/${encodeURIComponent(params.id)}`);
  const fraudId = useSearchParams().get("fraud");
  const [ticket, setTicket] = useState<OrderTicket>();
  const [preview, setPreview] = useState<OrderPreview>();
  const [transferId, setTransferId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  useEffect(() => { document.title = preview ? `Order preview: ${preview.symbol}` : data ? `Order preview: ${data.symbol}` : "Order preview"; }, [preview, data]);

  function clear() { setPreview(undefined); setTicket(undefined); setTransferId(""); setError(""); }

  async function submit(t: OrderTicket) {
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setError(""); setTransferId("");
    try {
      const result = await api<OrderPreview>("/v1/purchase/preview", { ...t, research_id: params.id });
      setTicket(t); setPreview(result);
    } catch (err) {
      setPreview(undefined); setTicket(undefined);
      setError(err instanceof ApiError ? err.message : String(err));
    } finally { inflight.current = false; setBusy(false); }
  }

  if (stockError && stockError.status !== 404) return <JobError error={stockError} onRetry={retry} />;
  const market = readMarket(data?.sections?.market);

  return (
    <>
      <h1 style={{ maxWidth: "18ch", marginBottom: 32 }}>Review the order before you place it</h1>
      <div className={styles.layout}>
        <OrderTicketForm defaultSymbol={data?.symbol ?? ""} defaultPrice={market.price} busy={busy} serverError={error}
          onEdit={clear} onSubmit={submit} />
        <PreviewSlip preview={preview} ticket={ticket} transferId={transferId} onTransfer={setTransferId} />
      </div>
      <LinkedReports researchId={params.id} symbol={data?.symbol} fraudId={fraudId} />
      <FinalHandoff />
    </>
  );
}
