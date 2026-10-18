"use client";
import { useRef } from "react";

export function Toggle<T extends string>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div className="toggle" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1} ref={el => { refs.current[i] = el; }}
          onClick={() => onChange(o.value)} onKeyDown={e => onKey(e, i)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
