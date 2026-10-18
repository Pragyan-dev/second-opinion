import type { FraudReport } from "./contracts";

export const CONTACT_SIGNAL_IDS = ["contact_match", "phone_match", "email_domain_match", "website_match"];
// Real backend flag ids, plus the two ids the fixtures use.
export const JEV_FLAG_IDS = ["guaranteed_returns", "urgency_deadline", "private_channel", "exclusivity_secrecy",
  "unusual_payment", "authority_claim", "urgency", "whatsapp"];

export interface Step { id: string; label: string; state: "done" | "active" | "waiting"; note?: string }

// Progress is derived from content, not poll count: steps can finish in any order.
export function fraudSteps(r: FraudReport | undefined): Step[] {
  const ids = new Set((r?.signals ?? []).map(s => s.id));
  const has = (...x: string[]) => x.some(i => ids.has(i));
  const defs = [
    { id: "read", label: "Read the message", done: Object.keys(r?.entities ?? {}).length > 0, err: [] as string[] },
    ...(r?.source_type === "email" ? [{ id: "phishing", label: "Checked for phishing", done: !!r.phishing, err: ["phishing_error"] }] : []),
    { id: "crawl", label: "Followed the link", done: !!r?.site_visit, err: ["crawl_error", "site_unreachable"] },
    { id: "registry", label: "Checked the registry", done: has("firm_record", "firm_not_found") || !!r?.official_contact, err: ["brokercheck_error"] },
    { id: "domain", label: "Checked domain age", done: has("domain_age") || r?.site_visit?.domain_age_days != null, err: ["rdap_error"] },
    { id: "jev", label: "Read the wording", done: (r?.jev_scores?.length ?? 0) > 0, err: ["jev_error"] },
    { id: "score", label: "Estimated likelihood", done: r?.fraud_likelihood != null || !!r?.band, err: ["scoring_error"] },
  ];
  const finished = r?.status === "done" || r?.status === "error";
  let activeSet = false;
  return defs.map(s => {
    const errored = s.err.some(e => ids.has(e));
    const done = s.done || errored || finished;
    let state: Step["state"] = "waiting";
    if (done) state = "done";
    else if (!activeSet) { state = "active"; activeSet = true; }
    return { id: s.id, label: s.label, state, note: errored && !s.done ? "couldn't finish" : undefined };
  });
}
