export interface RosetteOptions {
  cx: number; cy: number; rInner: number; rOuter: number;
  rings: number; lobes: number; amp: number; phase?: number;
  jitter?: number; gapFraction?: number; seed: string;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const STEP = (1.5 * Math.PI) / 180;
const SEGMENTS = 24;

// Returns one SVG path `d` per ring. Pure and deterministic for a given seed.
export function rosette(o: RosetteOptions): string[] {
  const { cx, cy, rInner, rOuter, rings, lobes, amp, phase = 0, jitter = 0, gapFraction = 0, seed } = o;
  const rand = mulberry32(hashSeed(seed));
  const out: string[] = [];
  const samples = Math.round((Math.PI * 2) / STEP);
  for (let i = 0; i < rings; i++) {
    const R = lerp(rInner, rOuter, rings === 1 ? 0 : i / (rings - 1));
    // value noise: one random offset per 12-degree knot, linearly interpolated
    const knots = Array.from({ length: 31 }, () => rand() * 2 - 1);
    const pts: [number, number][] = [];
    for (let k = 0; k <= samples; k++) {
      const th = (k % samples) * STEP;
      let r = R + amp * Math.sin(lobes * th + phase + i * 0.35);
      if (jitter) {
        const f = (th / (Math.PI * 2)) * 30, k0 = Math.floor(f), t = f - k0;
        r += jitter * lerp(knots[k0], knots[(k0 + 1) % 30], t);
      }
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
    }
    // choose which of the SEGMENTS arcs are dropped
    const dropped = new Set<number>();
    const dropCount = Math.round(gapFraction * SEGMENTS);
    while (dropped.size < dropCount) dropped.add(Math.floor(rand() * SEGMENTS));
    const per = samples / SEGMENTS;
    let d = "";
    for (let s = 0; s < SEGMENTS; s++) {
      if (dropped.has(s)) continue;
      const from = Math.floor(s * per), to = Math.floor((s + 1) * per);
      d += pts.slice(from, to + 1).map((p, j) => `${j === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
    }
    out.push(d);
  }
  return out;
}
