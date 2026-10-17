// Reef Academy data. Every ETF is a species; every market event is a storm.
// Returns are rounded, approximate total returns for teaching. They are not
// investment data: check a fund's own published history before relying on a number.

export const START_VALUE = 10000;

// Asset classes drive biodiversity. Funds in the same class move together.
export const CLASSES = {
  us: { label: "US stocks", color: "#ff9f6e" },
  tech: { label: "Tech stocks", color: "#ff5fa2" },
  intl: { label: "International stocks", color: "#ffd166" },
  dividend: { label: "Dividend stocks", color: "#4ade80" },
  defensive: { label: "Utilities", color: "#86efac" },
  energy: { label: "Energy", color: "#ff8c1a" },
  realestate: { label: "Real estate", color: "#e879f9" },
  bonds: { label: "Bonds", color: "#60a5fa" },
  longbonds: { label: "Long Treasuries", color: "#2dd4bf" },
  gold: { label: "Gold", color: "#facc15" },
};

// fee = expense ratio in percent per year (approximate).
export const SPECIES = [
  {
    id: "VTI", name: "Brain Coral", fund: "Vanguard Total Stock Market ETF", cls: "us", fee: 0.03,
    shape: "brain", color: "#ff9f6e",
    blurb: "One sturdy colony made of about 3,500 US companies. Slow, steady, hard to kill.",
  },
  {
    id: "QQQ", name: "Staghorn Coral", fund: "Invesco QQQ (Nasdaq-100)", cls: "tech", fee: 0.2,
    shape: "staghorn", color: "#ff5fa2",
    blurb: "Grows fast and tall toward the light. Its long branches snap in rough water.",
  },
  {
    id: "XLK", name: "Neon Anemone", fund: "Technology Select Sector SPDR", cls: "tech", fee: 0.08,
    shape: "anemone", color: "#c86bff",
    blurb: "Big tech companies in one glowing bloom. Gorgeous, and they all sway the same way.",
  },
  {
    id: "SOXX", name: "Lionfish", fund: "iShares Semiconductor ETF", cls: "tech", fee: 0.35,
    shape: "lionfish", color: "#ff4d4d",
    blurb: "Chipmakers. Spectacular in a boom, and first to vanish when the current turns.",
  },
  {
    id: "ARKK", name: "Glass Jellyfish", fund: "ARK Innovation ETF", cls: "tech", fee: 0.75,
    shape: "jelly", color: "#7af0ff",
    blurb: "A see-through drifter chasing the next big thing. High fees cloud the water.",
  },
  {
    id: "VXUS", name: "Sea Fan", fund: "Vanguard Total International Stock", cls: "intl", fee: 0.05,
    shape: "fan", color: "#ffd166",
    blurb: "Thousands of companies outside the US. Filters food from different currents.",
  },
  {
    id: "VYM", name: "Parrotfish", fund: "Vanguard High Dividend Yield", cls: "dividend", fee: 0.06,
    shape: "fish", color: "#4ade80",
    blurb: "Mature companies that pay steady dividends. Keeps grazing when others hide.",
  },
  {
    id: "XLU", name: "Seagrass Meadow", fund: "Utilities Select Sector SPDR", cls: "defensive", fee: 0.08,
    shape: "grass", color: "#86efac",
    blurb: "Power and water companies. People pay those bills in every kind of weather.",
  },
  {
    id: "XLE", name: "Fire Coral", fund: "Energy Select Sector SPDR", cls: "energy", fee: 0.08,
    shape: "firecoral", color: "#ff8c1a",
    blurb: "Oil and gas. Burns hot when prices spike, gets scorched when demand dies.",
  },
  {
    id: "VNQ", name: "Barrel Sponge", fund: "Vanguard Real Estate ETF", cls: "realestate", fee: 0.13,
    shape: "sponge", color: "#e879f9",
    blurb: "Landlords of offices, homes and warehouses. Soaks up whatever interest rates do.",
  },
  {
    id: "BND", name: "Giant Clam", fund: "Vanguard Total Bond Market", cls: "bonds", fee: 0.03,
    shape: "clam", color: "#60a5fa",
    blurb: "Loans to governments and companies. Grows slowly inside a thick shell.",
  },
  {
    id: "TLT", name: "Sea Turtle", fund: "iShares 20+ Year Treasury Bond", cls: "longbonds", fee: 0.15,
    shape: "turtle", color: "#2dd4bf",
    blurb: "Long US government loans. Swims away from panics, but rising rates are its predator.",
  },
  {
    id: "GLD", name: "Golden Seahorse", fund: "SPDR Gold Shares", cls: "gold", fee: 0.4,
    shape: "seahorse", color: "#facc15",
    blurb: "A bar of gold in a vault. Pays nothing, holds its shine when trust breaks.",
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// hit = percent return during the storm. regrowth = percent return in the period after it.
export const STORMS = [
  {
    id: "gfc",
    year: 2008,
    name: "The Great Financial Hurricane",
    category: 5,
    hitWindow: "Calendar 2008",
    regrowthWindow: "Calendar 2009",
    bottom: "New Year's Eve, 2008",
    teaser: "Banks made bad home loans, then lent to each other on top of them. When the loans broke, the whole seabed shook.",
    story: "US home prices fell, the mortgage bonds stacked on top of them collapsed, and Lehman Brothers failed in September 2008. Lending froze worldwide. Investors fled to the safest thing they could find: long-term US government bonds.",
    proxies: ["ARKK", "VXUS"],
    proxyNote: "ARKK (2014) and VXUS (2011) did not exist yet; their numbers use similar index proxies.",
    hit: { VTI: -37, QQQ: -42, XLK: -42, SOXX: -47, ARKK: -45, VXUS: -44, VYM: -32, XLU: -29, XLE: -39, VNQ: -37, BND: 5, TLT: 34, GLD: 5 },
    regrowth: { VTI: 29, QQQ: 55, XLK: 61, SOXX: 68, ARKK: 45, VXUS: 39, VYM: 18, XLU: 12, XLE: 21, VNQ: 30, BND: 4, TLT: -22, GLD: 24 },
    marketHit: -37,
  },
  {
    id: "covid",
    year: 2020,
    name: "The COVID Flash Typhoon",
    category: 4,
    hitWindow: "Feb 19 – Mar 23, 2020",
    regrowthWindow: "Mar 23 – Dec 31, 2020",
    bottom: "March 23, 2020",
    teaser: "The fastest crash in history. The world went home in five weeks, and almost everything sank at once.",
    story: "In five weeks stocks fell about a third as lockdowns shut down travel, offices and factories. Oil demand vanished so fast that one oil futures contract briefly traded below zero. Then the Federal Reserve cut rates to zero and Congress sent stimulus, and the rebound was just as violent.",
    proxies: [],
    proxyNote: "",
    hit: { VTI: -35, QQQ: -28, XLK: -31, SOXX: -36, ARKK: -38, VXUS: -34, VYM: -37, XLU: -36, XLE: -52, VNQ: -42, BND: -3, TLT: 12, GLD: -3 },
    regrowth: { VTI: 70, QQQ: 75, XLK: 78, SOXX: 100, ARKK: 250, VXUS: 60, VYM: 50, XLU: 40, XLE: 60, VNQ: 45, BND: 7, TLT: -5, GLD: 30 },
    marketHit: -35,
  },
  {
    id: "rates",
    year: 2022,
    name: "The Rate-Shock Riptide",
    category: 4,
    hitWindow: "Calendar 2022",
    regrowthWindow: "Calendar 2023",
    bottom: "New Year's Eve, 2022",
    teaser: "Inflation hit a 40-year high and the Fed raised rates faster than ever. This time even the clams got swept away.",
    story: "With prices rising about 9% a year, the Federal Reserve raised interest rates from near zero to over 4% in ten months. New bonds paid more, so old bonds lost value, and fast-growing tech companies whose profits sit far in the future got repriced hardest. Energy companies, selling oil at high prices, were the rare winners.",
    proxies: [],
    proxyNote: "",
    hit: { VTI: -20, QQQ: -33, XLK: -28, SOXX: -35, ARKK: -67, VXUS: -16, VYM: -0.5, XLU: 1, XLE: 64, VNQ: -26, BND: -13, TLT: -31, GLD: -1 },
    regrowth: { VTI: 26, QQQ: 55, XLK: 56, SOXX: 66, ARKK: 68, VXUS: 15, VYM: 6, XLU: -7, XLE: -1, VNQ: 12, BND: 6, TLT: 3, GLD: 13 },
    marketHit: -20,
  },
];

export const STORMS_BY_ID = Object.fromEntries(STORMS.map((s) => [s.id, s]));

// Starter reefs the player can load in one click.
export const PRESETS = [
  { id: "tech", name: "Tech-Bro Lagoon", tag: "monoculture", mix: { QQQ: 40, XLK: 30, SOXX: 30 } },
  { id: "three", name: "Three-Fund Atoll", tag: "classic", mix: { VTI: 50, VXUS: 30, BND: 20 } },
  { id: "allweather", name: "All-Weather Reef", tag: "storm-proof?", mix: { VTI: 30, TLT: 30, BND: 20, GLD: 10, XLE: 10 } },
  { id: "hype", name: "Hype Shoal", tag: "high fees", mix: { ARKK: 50, SOXX: 30, GLD: 20 } },
];

export const BADGES = {
  firstStorm: { icon: "🌀", name: "Storm Chaser", desc: "Survive your first storm." },
  monoculture: { icon: "🧪", name: "Monoculture Lesson", desc: "Run a reef that is over 80% one asset class into a storm." },
  diverse: { icon: "🌈", name: "Biodiversity Hotspot", desc: "Reach a biodiversity score of 80 or more." },
  clean: { icon: "💧", name: "Crystal Water", desc: "Keep the average fee at 0.10% or less." },
  diamond: { icon: "💎", name: "Diamond Fins", desc: "Hold through a storm that cost you 30% or more." },
  panic: { icon: "🏃", name: "Swam for Shore", desc: "Abandon the reef at the bottom of a storm." },
  threeStar: { icon: "⭐", name: "Reef Keeper", desc: "Earn three stars on any storm." },
  allStorms: { icon: "🏆", name: "Weathered Them All", desc: "Earn at least one star on every storm." },
  gauntlet: { icon: "🐉", name: "Gauntlet Survivor", desc: "Survive 2008, 2020 and 2022 back to back." },
  feeLab: { icon: "⏳", name: "Time Traveler", desc: "Fast-forward 30 years in the fee lab." },
};
