// Dr. Octavia Inkwell, the reef's marine biologist. Asks the local server's LLM route first and
// falls back to offline field notes built from the same facts, so the game works with no key.
import { CLASSES, SPECIES_BY_ID } from "./data.js";
import { money, signed } from "./sim.js";

const WHY = {
  gfc: {
    us: "the whole US economy slid into recession",
    tech: "investors dumped anything that needed good times to keep growing",
    intl: "the panic went global and banks abroad were hit too",
    dividend: "dividend payers held up a little better, though many banks cut their payouts",
    defensive: "people still paid their electric bills, so utilities fell less",
    energy: "oil crashed from $147 to under $40 a barrel as demand dried up",
    realestate: "the crisis started in property, so real estate was crushed",
    bonds: "high-quality bonds were a calm shelter",
    longbonds: "scared investors rushed into long US Treasuries and pushed their prices up",
    gold: "gold kept its value while trust in banks broke",
  },
  covid: {
    us: "lockdowns froze the economy almost overnight",
    tech: "tech fell too, but life moved online, so it bounced back first",
    intl: "the virus and the lockdowns were worldwide",
    dividend: "many dividend payers, like banks and oil companies, were hit hard",
    defensive: "even utilities were sold in the rush for cash",
    energy: "oil demand collapsed when the world stopped driving and flying",
    realestate: "empty offices, malls and hotels hurt landlords",
    bonds: "bonds wobbled for a few days until the Federal Reserve stepped in",
    longbonds: "investors fled to Treasuries as interest rates went to zero",
    gold: "gold dipped as people sold everything for cash, then climbed",
  },
  rates: {
    us: "higher interest rates made future profits worth less today",
    tech: "fast growers whose profits sit far in the future were repriced hardest",
    intl: "a strong dollar and Europe's energy crisis weighed on markets abroad",
    dividend: "steady, cash-paying companies came back into fashion",
    defensive: "people kept paying their bills, so utilities shrugged it off",
    energy: "oil and gas prices spiked after Russia invaded Ukraine",
    realestate: "higher mortgage and borrowing costs squeezed property owners",
    bonds: "rising rates made older, lower-paying bonds worth less",
    longbonds: "long bonds are the most sensitive to rates, so they had their worst year in decades",
    gold: "gold held roughly flat while almost everything else fell",
  },
};

const LESSON = {
  gfc: "In 2008 bonds and gold were the lifeboats. Owning different asset classes, not more tech tickers, is what kept reefs alive.",
  covid: "The fastest crash in history was followed by one of the fastest recoveries. The reefs that suffered most were the ones abandoned at the bottom.",
  rates: "2022 broke the usual rule: stocks and bonds sank together. Each storm favors different species, which is exactly why a reef needs many.",
};

export async function askBiologist(mode, facts, question = "") {
  try {
    const res = await fetch("/api/biologist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, facts, question }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.text) return { text: data.text, source: "ai" };
    }
  } catch {
    // Server missing, no key, or timeout: use the offline notes below.
  }
  return { text: fieldNotes(mode, facts, question), source: "notes" };
}

function fieldNotes(mode, f, question) {
  if (mode === "storm") return stormNotes(f);
  if (mode === "gauntlet") return gauntletNotes(f);
  if (mode === "fees") return feeNotes(f);
  return askNotes(f, question);
}

function stormNotes(f) {
  const rows = [...f.reef].sort((a, b) => a.hit - b.hit);
  const worst = rows[0];
  const best = rows[rows.length - 1];
  const why = WHY[f.storm.id];
  const out = [];
  const vsMarket = f.reefHitPct > f.marketHitPct ? "better than" : "worse than";
  out.push(`${f.storm.name} hit your reef for ${signed(f.reefHitPct)}, ${vsMarket} the whole US market's ${signed(f.marketHitPct)}.`);
  out.push(`Your ${worst.species} (${worst.ticker}) took the worst of it at ${signed(worst.hit)} because ${why[worst.cls]}.`);
  if (rows.length > 1 && best.ticker !== worst.ticker) {
    out.push(`${best.hit >= 0 ? "Meanwhile your" : "Even your toughest species, the"} ${best.species} (${best.ticker}) ${best.hit >= 0 ? `actually grew ${signed(best.hit)}` : `still lost ${signed(best.hit)}`}: ${why[best.cls]}.`);
  }
  if (f.dominantWeight >= 0.8) {
    out.push(`With ${Math.round(f.dominantWeight * 100)}% of the reef in ${f.dominantClass.toLowerCase()}, this was a monoculture: different tickers, same species, so they all bleached together.`);
  } else if (f.biodiversity >= 70) {
    out.push(`Your biodiversity score of ${f.biodiversity} meant some species were built for this weather while others suffered. That is diversification doing its job.`);
  }
  out.push(f.held
    ? `You rode the current, and the reef regrew to ${money(f.finalValue)}.`
    : `You abandoned the reef at the bottom and locked in ${money(f.finalValue)}. Had you held, it would have regrown to ${money(f.wouldHaveBeen)}.`);
  if (f.avgFee >= 0.3) out.push(`Also: fees of ${f.avgFee.toFixed(2)}% a year are clouding your water. Small each year, big over decades.`);
  out.push(LESSON[f.storm.id]);
  return out.join(" ");
}

function gauntletNotes(f) {
  const worst = [...f.legs].sort((a, b) => a.hitPct - b.hitPct)[0];
  const grew = f.final >= f.start;
  return [
    `Three storms in six years, and your reef ${grew ? "came out bigger" : "came out smaller"}: ${money(f.start)} became ${money(f.final)}.`,
    `The roughest leg was ${worst.year} at ${signed(worst.hitPct)}.`,
    f.biodiversity >= 70
      ? "Your mix had a different survivor in each storm (bonds in 2008, Treasuries and gold in 2020, energy and dividends in 2022). That rotation is why diversified reefs keep coming back."
      : "A reef built from one kind of species needs every storm to go its way. Over three very different storms, that's a lot of luck to ask for.",
    `Fees took about ${money(f.feesPaid)} along the way, quietly, every single year.`,
  ].join(" ");
}

function feeNotes(f) {
  const share = (f.lost / f.clean) * 100;
  return [
    `Thirty calm years at 7%. Your twin reef with zero fees grew to ${money(f.clean)}; yours grew to ${money(f.polluted)}.`,
    `That ${f.avgFee.toFixed(2)}% yearly fee siphoned ${money(f.lost)}, about ${share.toFixed(0)}% of the clean reef.`,
    "Fees are like slow pollution: you barely notice a cloudy day, but the silt compounds, because money lost to fees early can never grow later.",
    f.avgFee <= 0.1 ? "Your water is crystal clear. Low-cost index funds keep almost all of the growth for you." : "Funds with similar species often come in cheaper versions, which is worth checking before you plant.",
  ].join(" ");
}

function askNotes(f, question) {
  const tips = [];
  if (!f.planted) tips.push("Your seabed is still bare, so plant a few species first.");
  else {
    tips.push(`Right now your reef is ${f.planted}% planted with a biodiversity score of ${f.biodiversity} and ${f.avgFee.toFixed(2)}% average fees.`);
    if (f.dominantWeight >= 0.6) tips.push(`It leans heavily on ${f.dominantClass.toLowerCase()} (${Math.round(f.dominantWeight * 100)}%), so one storm can hit most of it at once.`);
    if (!f.classes.includes("Bonds") && !f.classes.includes("Long Treasuries")) tips.push("There's no shell-protected species like bonds, which often sheltered reefs in past crashes, though not in 2022.");
    if (f.avgFee >= 0.3) tips.push("Your water is getting cloudy from fees.");
  }
  return `My radio to the mainland is down (no AI key is set on the server), so here are my field notes instead${question ? " on your question" : ""}. ${tips.join(" ")} Try sending a storm at it to see how each species copes.`;
}

// Same facts the LLM gets, so both paths explain the same numbers.
export function stormFacts(storm, mix, result, score, held, sim) {
  const dom = sim.dominantClass(mix);
  return {
    storm: { id: storm.id, name: storm.name, year: storm.year, window: storm.hitWindow, regrowthWindow: storm.regrowthWindow, story: storm.story, proxyNote: storm.proxyNote },
    reef: result.rows.map((r) => ({
      ticker: r.id,
      species: SPECIES_BY_ID[r.id].name,
      fund: SPECIES_BY_ID[r.id].fund,
      cls: SPECIES_BY_ID[r.id].cls,
      assetClass: CLASSES[SPECIES_BY_ID[r.id].cls].label,
      pct: r.pct,
      hit: r.hit,
      regrowth: r.regrowth,
    })),
    reefHitPct: Math.round(result.hitPct * 10) / 10,
    marketHitPct: storm.marketHit,
    held,
    decision: held
      ? "HELD: the player rode the current and stayed invested through the regrowth period"
      : "ABANDONED: the player sold everything to cash at the bottom of the storm and missed the regrowth",
    startValue: result.start,
    lowValue: Math.round(result.afterHit),
    finalValue: Math.round(score.finalValue),
    wouldHaveBeen: Math.round(result.afterRegrowth),
    stars: score.stars,
    biodiversity: sim.biodiversity(mix),
    dominantClass: dom?.label ?? "",
    dominantWeight: dom?.weight ?? 0,
    avgFee: Math.round(sim.avgFee(mix) * 1000) / 1000,
  };
}
