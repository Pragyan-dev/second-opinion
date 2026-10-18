export interface RailStep { label: string; state: "done" | "active" | "waiting"; note?: string }

export function StatusRail({ steps, finished }: { steps: RailStep[]; finished: boolean }) {
  if (finished) return <p className="railFinished">Finished</p>;
  const done = steps.filter(s => s.state === "done").length;
  return (
    <div>
      <p className="sr-only" role="status">{done} of {steps.length} checks done</p>
      <ol className="rail" aria-hidden="true">
        {steps.map(s => (
          <li key={s.label} className={`railStep ${s.state === "done" ? "railDone" : s.state === "active" ? "railActive" : ""}`}>
            <span className="railDot" />
            {s.label}{s.note ? ` (${s.note})` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}
