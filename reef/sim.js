// Pure reef math: no DOM, no canvas.
import { CLASSES, SPECIES_BY_ID, START_VALUE, STORMS } from "./data.js";

export function totalPct(mix) {
  return Object.values(mix).reduce((sum, pct) => sum + pct, 0);
}

export function classWeights(mix) {
  const total = totalPct(mix) || 1;
  const weights = {};
  for (const [id, pct] of Object.entries(mix)) {
    const cls = SPECIES_BY_ID[id].cls;
    weights[cls] = (weights[cls] || 0) + pct / total;
  }
  return weights;
}

// Gini-Simpson index across asset classes, scaled so six equal classes score 100.
export function biodiversity(mix) {
  if (!totalPct(mix)) return 0;
  const sumSq = Object.values(classWeights(mix)).reduce((s, w) => s + w * w, 0);
  return Math.round(Math.min(100, ((1 - sumSq) / (1 - 1 / 6)) * 100));
}

export function dominantClass(mix) {
  const entries = Object.entries(classWeights(mix)).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const [cls, weight] = entries[0];
  return { cls, label: CLASSES[cls].label, weight };
}

export function avgFee(mix) {
  const total = totalPct(mix) || 1;
  return Object.entries(mix).reduce((s, [id, pct]) => s + (pct / total) * SPECIES_BY_ID[id].fee, 0);
}

// 0 = crystal clear, 1 = sludge. 1% a year in fees is already very murky.
export function murk(fee) {
  return Math.min(1, fee / 1.0);
}

export function waterLabel(fee) {
  if (fee <= 0.1) return "Crystal clear";
  if (fee <= 0.25) return "Slightly hazy";
  if (fee <= 0.5) return "Cloudy";
  return "Polluted";
}

export function diversityLabel(score) {
  if (score >= 80) return "Thriving ecosystem";
  if (score >= 55) return "Healthy mix";
  if (score >= 30) return "Thin variety";
  return "Monoculture";
}

// Value of each species before, after the storm, and after regrowth (if held).
export function runStorm(mix, storm, start = START_VALUE) {
  const total = totalPct(mix);
  const rows = Object.entries(mix).map(([id, pct]) => {
    const before = (start * pct) / total;
    const afterHit = before * (1 + storm.hit[id] / 100);
    const afterRegrowth = afterHit * (1 + storm.regrowth[id] / 100);
    return { id, pct, before, afterHit, afterRegrowth, hit: storm.hit[id], regrowth: storm.regrowth[id] };
  });
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const afterHit = sum("afterHit");
  return {
    rows,
    start,
    afterHit,
    afterRegrowth: sum("afterRegrowth"),
    hitPct: (afterHit / start - 1) * 100,
  };
}

// Stars: survive, beat the market's damage, and be back near full size after regrowth.
export function scoreStorm(result, storm, held) {
  const finalValue = held ? result.afterRegrowth : result.afterHit;
  const checks = [
    { label: "Survived (lost less than half)", ok: result.hitPct > -50 },
    { label: `Sheltered (lost less than the whole market's ${signed(storm.marketHit)})`, ok: result.hitPct > storm.marketHit },
    { label: "Regrew to 90%+ of its starting size", ok: held && finalValue >= result.start * 0.9 },
  ];
  return { checks, stars: checks.filter((c) => c.ok).length, finalValue };
}

// Storm years back to back. The reef is replanted to the same mix after each storm.
export function runGauntlet(mix, start = START_VALUE) {
  let value = start;
  const legs = STORMS.map((storm) => {
    const result = runStorm(mix, storm, value);
    const fee = avgFee(mix) / 100;
    const afterFees = result.afterRegrowth * (1 - fee) ** 2;
    const leg = { storm, from: value, low: result.afterHit, to: afterFees, hitPct: result.hitPct };
    value = afterFees;
    return leg;
  });
  return { legs, final: value, start };
}

// Calm-sea growth with and without fees. `rate` is an assumed yearly return in percent.
export function feeProjection(fee, years, rate = 7, start = START_VALUE) {
  const clean = start * (1 + rate / 100) ** years;
  const polluted = start * (1 + (rate - fee) / 100) ** years;
  return { clean, polluted, lost: clean - polluted };
}

export function money(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function signed(pct, digits = 0) {
  const fixed = Math.abs(pct).toFixed(digits);
  return `${pct >= 0 ? "+" : "−"}${fixed}%`;
}
