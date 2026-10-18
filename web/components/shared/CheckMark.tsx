import type { Check } from "@/lib/contracts";

const GLYPH: Record<Check, string> = { pass: "✓", warn: "!", fail: "✕", unknown: "?" };
const WORD: Record<Check, string> = { pass: "Passed", warn: "Needs a look", fail: "Did not pass", unknown: "Not checked" };

export function CheckMark({ check }: { check: Check }) {
  return (
    <span className={`check check-${check}`}>
      <span aria-hidden="true">{GLYPH[check]}</span>
      <span className="sr-only">{WORD[check]}</span>
    </span>
  );
}
