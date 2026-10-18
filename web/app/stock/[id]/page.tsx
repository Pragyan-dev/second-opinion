"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { StockReport } from "@/lib/contracts";
import { uniqueSources } from "@/lib/format";
import { readHistory, readIncome, readMarket, readNews, readRedFlags } from "@/lib/sections";
import { useJob } from "@/lib/useJob";
import { JobError, Stalled } from "@/components/shared/JobError";
import { SourceLine } from "@/components/shared/Cite";
import { ProConColumns } from "@/components/shared/ProConColumns";
import { Skeleton } from "@/components/shared/Skeleton";
import { StatusRail } from "@/components/shared/StatusRail";
import { ArticleList } from "@/components/stock/ArticleList";
import { IncomePanel } from "@/components/stock/IncomePanel";
import { PriceHistoryChart } from "@/components/stock/PriceHistoryChart";
import { QuestionList } from "@/components/stock/QuestionList";
import { RedFlagsPanel } from "@/components/stock/RedFlagsPanel";
import { SectionShell } from "@/components/stock/SectionShell";
import { StockHeader } from "@/components/stock/StockHeader";
import { VolatilityPer1000 } from "@/components/stock/VolatilityPer1000";
import styles from "@/components/stock/stock.module.css";

const AGENTS = [["market", "Price"], ["history", "History"], ["income", "Dividends"], ["red_flags", "Red flags"], ["news", "News"]] as const;

export default function StockPage({ params }: { params: { id: string } }) {
  const { data, error, stalled, retry } = useJob<StockReport>(`/v1/stock/${encodeURIComponent(params.id)}`);
  const fraudId = useSearchParams().get("fraud");
  useEffect(() => { document.title = data ? `${data.symbol} research` : "Stock research"; }, [data]);

  if (error) return <JobError error={error} onRetry={retry} />;
  const sec = data?.sections ?? {};
  const running = !data || data.status === "pending" || data.status === "running";
  const market = readMarket(sec.market), history = readHistory(sec.history), income = readIncome(sec.income);
  const flags = readRedFlags(sec.red_flags), news = readNews(sec.news);
  const articles = data?.articles?.length ? data.articles : news.items;
  const asOf = [market, history, income, flags, news].map(s => s.asOf).find(Boolean) ?? null;

  const steps = [...AGENTS.map(([k, label]) => ({ label, state: (["done", "error"].includes(sec[k]?.status ?? "") ? "done" : "waiting") as "done" | "waiting" | "active" })),
    { label: "Summary", state: (data?.summary ? "done" : "waiting") as "done" | "waiting" | "active" }];
  const firstWaiting = steps.findIndex(s => s.state === "waiting");
  if (firstWaiting >= 0) steps[firstWaiting].state = "active";

  const allSources = uniqueSources(Object.values(sec).map(s => s.sources));
  const checkoutHref = `/checkout/${encodeURIComponent(params.id)}${fraudId ? `?fraud=${encodeURIComponent(fraudId)}` : ""}`;

  return (
    <>
      <section className="band">
        {data ? <StockHeader report={data} market={market} flags={flags} fraudId={fraudId} asOf={asOf} /> : <Skeleton height={65} width={320} label="Symbol loading" />}
        <div style={{ margin: "16px 0" }}><StatusRail steps={steps} finished={!running} /></div>
        {stalled && <Stalled onKeepWaiting={retry} />}
        {data?.summary ? <><p className={styles.summary}>{data.summary}</p><div style={{ marginTop: 8 }}><SourceLine sources={allSources} /></div></>
          : <Skeleton height={96} label="Summary loading" />}
      </section>

      <section className="band">
        <SectionShell section={sec.history} name="Price history" height={360}>
          <PriceHistoryChart prices1y={history.prices1y} prices5y={history.prices5y} high52={history.high52} low52={history.low52}
            maxDrawdown={history.maxDrawdown ?? market.maxDrawdown} return1y={history.return1y} return5y={history.return5y}
            earnings={history.earnings} sources={history.sources} />
        </SectionShell>
      </section>

      <section className="band threeCol">
        <SectionShell section={sec.market} name="Price data"><VolatilityPer1000 m={market} symbol={data?.symbol ?? ""} /></SectionShell>
        <SectionShell section={sec.income} name="Dividend data"><IncomePanel i={income} /></SectionShell>
        <SectionShell section={sec.red_flags} name="Red flag data"><RedFlagsPanel r={flags} /></SectionShell>
      </section>

      <section className="band">
        <SectionShell section={sec.news} name="News" height={240}>
          <ArticleList articles={articles} pressShare={news.pressShare} sources={news.sources} />
        </SectionShell>
      </section>

      <section className="band">
        {data?.pros || data?.cons ? <ProConColumns pros={data.pros ?? []} cons={data.cons ?? []} /> : <Skeleton height={160} label="Pros and cons loading" />}
      </section>

      {data?.questions && data.questions.length > 0 && <section className="band"><QuestionList questions={data.questions} /></section>}

      {data && (
        <section className="band">
          <Link className="btn" href={checkoutHref}>Preview an order</Link>
          <p className="small muted" style={{ marginTop: 8 }}>Previews only. Second Opinion can&apos;t place orders.</p>
        </section>
      )}
    </>
  );
}
