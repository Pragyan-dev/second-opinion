import type { ProCon } from "@/lib/contracts";
import { Cite } from "./Cite";

function Column({ title, items }: { title: string; items: ProCon[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? <p className="muted" style={{ paddingTop: 8 }}>Nothing found</p> : (
        <ul>{items.map((p, i) => <li key={i}>{p.text}<Cite source={p.source} /></li>)}</ul>
      )}
    </div>
  );
}

export function ProConColumns({ pros, cons }: { pros: ProCon[]; cons: ProCon[] }) {
  return (
    <div className="proCon">
      <Column title="For" items={pros} />
      <Column title="Against" items={cons} />
    </div>
  );
}
