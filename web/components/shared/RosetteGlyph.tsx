import { rosette } from "@/components/fraud/guilloche";

// Small guilloche mark used in the wordmark and on the home page.
export function RosetteGlyph({ size = 18, rings = 5, seed = "mark" }: { size?: number; rings?: number; seed?: string }) {
  const paths = rosette({ cx: 50, cy: 50, rInner: 12, rOuter: 46, rings, lobes: 7, amp: 4, seed });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--ink)" strokeWidth={size > 40 ? 0.6 : 3} strokeOpacity=".75" />)}
    </svg>
  );
}
