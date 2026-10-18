import type { AgentResult } from "@/lib/contracts";
import { Skeleton } from "@/components/shared/Skeleton";
import styles from "./stock.module.css";

// Wraps one agent's panel: skeleton while pending, plain error text on failure, then content.
export function SectionShell({ section, name, height = 120, children }: {
  section: AgentResult | undefined; name: string; height?: number; children: React.ReactNode;
}) {
  if (!section || section.status === "pending" || section.status === "running") return <Skeleton height={height} label={`${name} loading`} />;
  if (section.status === "error") return <p className={styles.errorPanel}>{name} didn&apos;t load{section.error ? `: ${section.error}` : "."}</p>;
  return <div className="fadeIn">{children}</div>;
}
