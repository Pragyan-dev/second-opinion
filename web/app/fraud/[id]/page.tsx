"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { FraudReport } from "@/lib/contracts";
import { fraudSteps } from "@/lib/fraudSteps";
import { hostname, sourceTypeNoun } from "@/lib/format";
import { useJob } from "@/lib/useJob";
import { CheckedSiteContext, checkedHosts } from "@/lib/checkedSite";
import { JobError, Stalled } from "@/components/shared/JobError";
import { ProConColumns } from "@/components/shared/ProConColumns";
import { Skeleton } from "@/components/shared/Skeleton";
import { StatusRail } from "@/components/shared/StatusRail";
import { BandStatement } from "@/components/fraud/BandStatement";
import { ContactCompare } from "@/components/fraud/ContactCompare";
import { EntityChips } from "@/components/fraud/EntityChips";
import { JevChart } from "@/components/fraud/JevChart";
import { LikelihoodSeal } from "@/components/fraud/LikelihoodSeal";
import { LinkTrail } from "@/components/fraud/LinkTrail";
import { LiveView } from "@/components/fraud/LiveView";
import { PagePanel } from "@/components/fraud/PagePanel";
import { PhishingPanel } from "@/components/fraud/PhishingPanel";
import { SignalLedger } from "@/components/fraud/SignalLedger";
import styles from "@/components/fraud/fraud.module.css";

const DEMO_TOOLS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_TOOLS === "1";

export default function FraudPage({ params }: { params: { id: string } }) {
  const { data, error, stalled, retry } = useJob<FraudReport>(`/v1/fraud/${encodeURIComponent(params.id)}`);
  const search = useSearchParams();
  const forceCantTell = DEMO_TOOLS && search.get("preview") === "cant_tell";

  const report = useMemo<FraudReport | undefined>(() => {
    if (!data || !forceCantTell) return data;
    return { ...data, fraud_likelihood: null, band: "cant_tell", band_reason: data.band_reason && data.band === "cant_tell" ? data.band_reason : null, explanation: null };
  }, [data, forceCantTell]);

  const running = !report || report.status === "pending" || report.status === "running";
  useEffect(() => {
    if (!report) { document.title = "Checking… Second Opinion"; return; }
    const what = report.entities?.firms?.[0] ?? hostname(report.page_url);
    document.title = report.fraud_likelihood != null
      ? `${report.fraud_likelihood}% estimated likelihood: ${what}` : `Fraud check: ${what}`;
  }, [report]);

  if (error) return <JobError error={error} onRetry={retry} />;
  const steps = fraudSteps(report);
  const finished = !running;

  return (
    <CheckedSiteContext.Provider value={checkedHosts(report?.site_visit)}>
      <div className={styles.heroTop}>
        <h1 style={{ maxWidth: "20ch" }}>
          {!report ? "Checking…"
            : report.phishing ? <>Checked the email &ldquo;{report.phishing.email_title || "(no subject)"}&rdquo;</>
            : <>Checked {sourceTypeNoun(report.source_type)} from {hostname(report.page_url) || "an unknown page"}</>}
        </h1>
        <StatusRail steps={steps.map(s => ({ label: s.label, state: s.state, note: s.note }))} finished={finished} />
        {report?.page_url && <a className={styles.pageLink} href={report.page_url} target="_blank" rel="noreferrer">Open the page we checked<span className="sr-only"> (opens in a new tab)</span></a>}
        {report?.status === "error" && <p role="alert" className="flagRed" style={{ color: "var(--seal)" }}>This check ended with an error. Results below may be partial.</p>}
        {stalled && <Stalled onKeepWaiting={retry} />}
      </div>

      <section className={`band ${styles.hero}`} aria-label="Result">
        {report ? <LikelihoodSeal reportId={report.report_id} likelihood={report.fraud_likelihood} band={report.band} running={running} />
          : <Skeleton width={360} height={360} label="Likelihood loading" />}
        {report ? <BandStatement report={report} /> : <Skeleton height={120} />}
      </section>

      {report?.phishing && <PhishingPanel phishing={report.phishing} />}

      {/* The linked page, analysed on its own. A website capture is the page itself. */}
      {report && report.source_type !== "website" && (report.page || (running && !!report.site_visit)) && (
        <PagePanel page={report.page} running={running} noun={report.source_type === "email" ? "email" : "message"} />
      )}

      {report && <LiveView reportId={report.report_id} running={running} />}

      <section className="band">
        <h2>What the message says</h2>
        <p className="sub">How strongly the wording matches six common investment-scam red flags.</p>
        <JevChart scores={report?.jev_scores ?? []} running={running} />
      </section>

      {report && (report.site_visit || report.official_contact || running) && (
        <section className="band">
          {report.site_visit || report.official_contact ? <ContactCompare report={report} /> : <Skeleton height={200} label="Comparison loading" />}
        </section>
      )}

      <section className="band twoCol">
        <div>
          <h2>What we checked</h2>
          <div style={{ height: 16 }} />
          <SignalLedger signals={report?.signals ?? []} running={running} />
        </div>
        <div>
          <h2>Where the link went</h2>
          <div style={{ height: 16 }} />
          <LinkTrail visit={report?.site_visit} running={running} />
          <div style={{ height: 32 }} />
          <h2>Found in the message</h2>
          <div style={{ height: 16 }} />
          {report ? <EntityChips entities={report.entities} stockResearchId={report.stock_research_id} reportId={report.report_id} /> : <Skeleton height={80} />}
        </div>
      </section>

      {report && ((report.stock_pros?.length ?? 0) > 0 || (report.stock_cons?.length ?? 0) > 0) && (
        <section className="band">
          <h2>About {report.entities?.tickers?.[0] ?? "the stock"}, the stock the message mentions</h2>
          <div style={{ height: 16 }} />
          <ProConColumns pros={report.stock_pros ?? []} cons={report.stock_cons ?? []} />
          {report.stock_research_id && (
            <div className={styles.stockLinkRow}>
              <Link className="btn" href={`/stock/${encodeURIComponent(report.stock_research_id)}?fraud=${encodeURIComponent(report.report_id)}`}>Full stock report</Link>
            </div>
          )}
        </section>
      )}
    </CheckedSiteContext.Provider>
  );
}
