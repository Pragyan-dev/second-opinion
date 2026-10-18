import type { Source } from "@/lib/contracts";

export function Cite({ source }: { source?: Source | null }) {
  if (!source?.url) return <span className="citeNone">No source given</span>;
  return (
    <span className="cite">
      <a href={source.url} target="_blank" rel="noreferrer" title={source.title}>
        source<span className="sr-only">: {source.title} (opens in a new tab)</span>
      </a>
    </span>
  );
}

// A list of sources under a block, "Sources: a, b".
export function SourceLine({ sources }: { sources: Source[] }) {
  if (!sources.length) return <p className="tiny" style={{ color: "var(--graphite)" }}>No source given</p>;
  return (
    <p className="tiny muted">
      Sources:{" "}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ", "}
          <a href={s.url} target="_blank" rel="noreferrer">{s.title}<span className="sr-only"> (opens in a new tab)</span></a>
        </span>
      ))}
    </p>
  );
}
