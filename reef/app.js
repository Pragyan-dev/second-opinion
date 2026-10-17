import { BADGES, CLASSES, PRESETS, SPECIES, SPECIES_BY_ID, START_VALUE, STORMS } from "./data.js";
import * as sim from "./sim.js";
import { money, signed } from "./sim.js";
import { Reef, paintThumb } from "./render.js";
import { askBiologist, stormFacts } from "./biologist.js";

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP = 10;
const LEVELS = [
  [0, "Tide-Pool Tourist"], [150, "Snorkeler"], [400, "Reef Ranger"],
  [800, "Coral Gardener"], [1300, "Ocean Steward"], [2000, "Reef Legend"],
];

// ---------- persistence (per-viewer convenience only) ----------
const SAVE_KEY = "reef-academy-v1";
function load() {
  try {
    return { xp: 0, stars: {}, badges: [], gauntletBest: 0, played: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
  } catch {
    return { xp: 0, stars: {}, badges: [], gauntletBest: 0, played: {} };
  }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* storage blocked */ }
}

const progress = load();
const state = { mix: {}, busy: false };
const reef = new Reef($("#reef"));

// ---------- nursery ----------
function buildCatalog() {
  const root = $("#catalog");
  for (const sp of SPECIES) {
    const cls = CLASSES[sp.cls];
    const el = document.createElement("div");
    el.className = "sp";
    el.dataset.id = sp.id;
    el.style.setProperty("--c", cls.color);
    el.innerHTML = `
      <canvas class="thumb" aria-hidden="true"></canvas>
      <div>
        <div class="sp-name">${sp.name} <span class="tick">${sp.id}</span></div>
        <div class="sp-fund">${sp.fund}</div>
        <div class="sp-tags"><span class="tag cls">${cls.label}</span><span class="tag fee ${sp.fee >= 0.3 ? "high" : ""}">fee ${sp.fee.toFixed(2)}%</span></div>
      </div>
      <div class="sp-ctrl">
        <button class="step" data-d="1" type="button" aria-label="Plant more ${sp.name}">+</button>
        <b>0%</b>
        <button class="step" data-d="-1" type="button" aria-label="Plant less ${sp.name}">−</button>
      </div>
      <p class="sp-blurb">${sp.blurb}</p>`;
    paintThumb(el.querySelector("canvas"), sp.id);
    el.addEventListener("click", (e) => {
      const btn = e.target.closest(".step");
      if (btn) adjust(sp.id, Number(btn.dataset.d) * STEP);
    });
    root.append(el);
  }
  const presets = $("#presets");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset";
    b.type = "button";
    b.innerHTML = `<b>${p.name}</b><small>${p.tag}</small>`;
    b.addEventListener("click", () => setMix({ ...p.mix }));
    presets.append(b);
  }
  $("#clearBtn").addEventListener("click", () => setMix({}));
}

function adjust(id, delta) {
  if (state.busy) return;
  const total = sim.totalPct(state.mix);
  const cur = state.mix[id] || 0;
  const next = Math.max(0, Math.min(cur + delta, cur + (100 - total)));
  if (next === cur) {
    if (delta > 0) flashPlanted();
    return;
  }
  const mix = { ...state.mix };
  if (next) mix[id] = next;
  else delete mix[id];
  setMix(mix);
}

function setMix(mix, quiet = false) {
  if (state.busy) return;
  // keep catalog order so the reef layout is stable
  state.mix = Object.fromEntries(SPECIES.filter((s) => mix[s.id]).map((s) => [s.id, mix[s.id]]));
  reef.setMix(state.mix);
  refresh();
  if (!quiet) commentOnMix();
}

function flashPlanted() {
  const el = $("#plantedText").closest(".meter");
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

// ---------- HUD ----------
function refresh() {
  const mix = state.mix;
  const total = sim.totalPct(mix);
  const bio = sim.biodiversity(mix);
  const fee = sim.avgFee(mix);
  for (const el of document.querySelectorAll(".sp")) {
    const pct = mix[el.dataset.id] || 0;
    el.classList.toggle("active", pct > 0);
    el.querySelector("b").textContent = `${pct}%`;
    el.querySelector('[data-d="1"]').disabled = state.busy || total >= 100;
    el.querySelector('[data-d="-1"]').disabled = state.busy || !pct;
  }
  $("#bioFill").style.width = `${bio}%`;
  $("#bioText").textContent = bio;
  $("#bioLabel").textContent = total ? sim.diversityLabel(bio) : "Barren";
  $("#feeFill").style.width = `${Math.min(100, fee * 100)}%`;
  $("#feeText").textContent = `${fee.toFixed(2)}%`;
  $("#feeLabel").textContent = total ? sim.waterLabel(fee) : "Crystal clear";
  $("#plantedText").textContent = `${total}%`;
  $("#plantedSub").textContent = total >= 100 ? "Reef full. Ready for a storm" : `${100 - total}% of seabed still bare`;
  reef.setBiodiversity(bio);
  reef.setMurk(sim.murk(fee));

  // allocation bar by asset class
  const weights = sim.classWeights(mix);
  $("#allocbar").innerHTML = Object.entries(weights)
    .map(([cls, w]) => `<i style="width:${(w * total).toFixed(1)}%;background:${CLASSES[cls].color}" title="${CLASSES[cls].label} ${Math.round(w * 100)}%"></i>`)
    .join("");
  const dom = sim.dominantClass(mix);
  $("#legend").innerHTML = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([cls, w]) => `<span><i style="background:${CLASSES[cls].color}"></i>${CLASSES[cls].label} ${Math.round(w * 100)}%</span>`)
    .join("") + (dom && dom.weight >= 0.6 && total ? `<span class="warn">⚠ ${Math.round(dom.weight * 100)}% ${dom.label}: monoculture risk</span>` : "");

  const ready = total === 100 && !state.busy;
  for (const card of document.querySelectorAll(".storm")) {
    card.classList.toggle("ready", ready);
    card.querySelector(".storm-btn").disabled = !ready;
  }
  const unlocked = STORMS.every((s) => progress.played[s.id]);
  const gb = $("#gauntletBtn");
  gb.disabled = !ready || !unlocked;
  gb.textContent = unlocked ? "🐉 Enter the Gauntlet" : `🔒 Locked (${STORMS.filter((s) => progress.played[s.id]).length}/3 storms)`;
  $("#gauntletBest").textContent = progress.gauntletBest ? `Best ${money(progress.gauntletBest)}` : "";
  $("#feeBtn").disabled = !ready;
  $("#clearBtn").disabled = state.busy;
  for (const b of document.querySelectorAll(".preset")) b.disabled = state.busy;
  renderProgress();
}

function setValue(value, sub, cls = "") {
  const el = $("#valueText");
  el.textContent = money(value);
  el.className = `meter-value ${cls}`;
  if (sub !== undefined) $("#valueSub").textContent = sub;
}

function tweenValue(from, to, ms, sub) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const v = from + (to - from) * e;
      setValue(v, sub, v < START_VALUE * 0.995 ? "down" : v > START_VALUE * 1.005 ? "up" : "");
      k < 1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
}

// ---------- progress, XP, badges ----------
function levelFor(xp) {
  let idx = 0;
  LEVELS.forEach(([min], i) => { if (xp >= min) idx = i; });
  const [min, title] = LEVELS[idx];
  const next = LEVELS[idx + 1]?.[0];
  return { title, pct: next ? ((xp - min) / (next - min)) * 100 : 100, next };
}

function renderProgress() {
  const lv = levelFor(progress.xp);
  $("#levelTitle").textContent = lv.title;
  $("#xpFill").style.width = `${lv.pct}%`;
  $("#xpText").textContent = lv.next ? `${progress.xp} / ${lv.next} XP` : `${progress.xp} XP`;
  $("#badgeCount").textContent = progress.badges.length;
  for (const card of document.querySelectorAll(".storm")) {
    const n = progress.stars[card.dataset.id] || 0;
    card.querySelector(".stars").innerHTML = [0, 1, 2].map((i) => `<span class="${i < n ? "" : "off"}">★</span>`).join("");
  }
}

function award(id) {
  if (progress.badges.includes(id)) return false;
  progress.badges.push(id);
  const b = BADGES[id];
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${b.icon}</span><div><b>Badge: ${b.name}</b><small>${b.desc}</small></div>`;
  showToast(t);
  return true;
}

function gainXp(amount) {
  const before = levelFor(progress.xp).title;
  progress.xp += amount;
  const after = levelFor(progress.xp).title;
  if (after !== before) toast("🎉", `Level up: ${after}`, "Your reef-keeping is getting serious.");
}

function toast(icon, title, sub) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${icon}</span><div><b>${title}</b><small>${sub}</small></div>`;
  showToast(t);
}

// Toasts live in a popover so they sit above any open dialog.
function showToast(t) {
  const box = $("#toasts");
  box.append(t);
  try {
    if (box.matches(":popover-open")) box.hidePopover();
    box.showPopover();
  } catch { /* popover unsupported: falls back to a fixed element */ }
  setTimeout(() => {
    t.remove();
    if (!box.children.length) try { box.hidePopover(); } catch { /* ignore */ }
  }, 5000);
}

function showBadges() {
  $("#badgeGrid").innerHTML = Object.entries(BADGES)
    .map(([id, b]) => `<div class="badge ${progress.badges.includes(id) ? "got" : ""}"><span>${b.icon}</span><div><b>${b.name}</b><small>${b.desc}</small></div></div>`)
    .join("");
  $("#badgesDlg").showModal();
}

// ---------- Dr. Inkwell ----------
let typingToken = 0;
async function say(text, source = "notes", target = $("#bubble")) {
  const token = ++typingToken;
  const box = $("#biologist");
  box.classList.add("talking");
  const src = $("#bioSrc");
  src.textContent = source === "ai" ? "AI · live" : source === "thinking" ? "thinking…" : "field notes";
  src.classList.toggle("ai", source === "ai");
  const targets = target === $("#bubble") ? [target] : [target, $("#bubble")];
  // Characters follow elapsed time, so throttled background tabs still finish promptly.
  const t0 = performance.now();
  for (let i = 0; i < text.length; i = Math.floor((performance.now() - t0) / 6)) {
    if (token !== typingToken) return;
    for (const t of targets) t.innerHTML = `${escapeHtml(text.slice(0, i))}<span class="caret"></span>`;
    await sleep(16);
  }
  if (token !== typingToken) return;
  for (const t of targets) t.textContent = text;
  box.classList.remove("talking");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

let commentTimer;
function commentOnMix() {
  clearTimeout(commentTimer);
  commentTimer = setTimeout(() => {
    if (state.busy) return;
    const mix = state.mix;
    const total = sim.totalPct(mix);
    const bio = sim.biodiversity(mix);
    const fee = sim.avgFee(mix);
    const dom = sim.dominantClass(mix);
    let line;
    if (!total) line = "A bare seabed. Every ETF in the nursery is a species, so tap + to plant 10% of your reef at a time.";
    else if (dom.weight >= 0.8 && Object.keys(mix).length >= 2) line = `Hmm. ${Object.keys(mix).length} different tickers, but ${Math.round(dom.weight * 100)}% of them are ${dom.label.toLowerCase()}. Biologically that's one species in different costumes. Looks lush until a storm hits.`;
    else if (dom.weight >= 0.8) line = `A single-species reef. ${SPECIES_BY_ID[Object.keys(mix)[0]].name} everywhere. If its storm comes, there's no one to survive it.`;
    else if (fee >= 0.4) line = `Pretty reef, but do you see the water going cloudy? Your average fee is ${fee.toFixed(2)}% a year. That's pollution that never stops.`;
    else if (total < 100) line = `Nice start: ${100 - total}% of the seabed is still bare. Biodiversity is ${bio}. Mixing different asset classes raises it fastest.`;
    else if (bio >= 80) line = `Now that's a thriving ecosystem: biodiversity ${bio}, fees ${fee.toFixed(2)}%. Let's see how it handles a real storm.`;
    else line = `Reef planted! Biodiversity ${bio}, water ${sim.waterLabel(fee).toLowerCase()}. Pick a storm from the chamber when you're ready.`;
    if (bio >= 80) award("diverse");
    if (total === 100 && fee <= 0.1) award("clean");
    save();
    renderProgress();
    say(line);
  }, 450);
}

async function onAsk(e) {
  e.preventDefault();
  const input = $("#askInput");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  const mix = state.mix;
  const dom = sim.dominantClass(mix);
  const facts = {
    planted: sim.totalPct(mix),
    reef: Object.entries(mix).map(([id, pct]) => ({ ticker: id, species: SPECIES_BY_ID[id].name, fund: SPECIES_BY_ID[id].fund, assetClass: CLASSES[SPECIES_BY_ID[id].cls].label, fee: SPECIES_BY_ID[id].fee, pct })),
    classes: Object.keys(sim.classWeights(mix)).map((c) => CLASSES[c].label),
    biodiversity: sim.biodiversity(mix),
    avgFee: sim.avgFee(mix),
    dominantClass: dom?.label ?? "",
    dominantWeight: dom?.weight ?? 0,
    storms: STORMS.map((s) => ({ year: s.year, name: s.name, stars: progress.stars[s.id] || 0 })),
  };
  $("#bubble").textContent = "🔬 Peering through the microscope…";
  $("#bioSrc").textContent = "thinking…";
  const reply = await askBiologist("ask", facts, question);
  say(reply.text, reply.source);
}

// ---------- banner ----------
function banner(html, cls = "") {
  const el = $("#banner");
  el.className = `banner ${cls}`;
  el.innerHTML = html;
  el.hidden = false;
}
function hideBanner() { $("#banner").hidden = true; }

// ---------- storms ----------
function buildStorms() {
  const root = $("#storms");
  for (const storm of STORMS) {
    const el = document.createElement("div");
    el.className = "card storm";
    el.dataset.id = storm.id;
    el.innerHTML = `
      <div class="card-top"><span class="year">${storm.year}</span><span class="cat">CAT ${storm.category} ${"●".repeat(storm.category)}${"○".repeat(5 - storm.category)}</span></div>
      <h3>${storm.name}</h3>
      <p>${storm.teaser}</p>
      <div class="storm-foot"><span class="stars"></span><button class="btn storm-btn" type="button">Unleash ⚡</button></div>`;
    el.querySelector(".storm-btn").addEventListener("click", () => unleash(storm));
    root.append(el);
  }
}

function lock(on) {
  state.busy = on;
  refresh();
}

async function stormHit(storm, result) {
  banner(`<div class="b-eyebrow">⚠ CATEGORY ${storm.category} · ${storm.hitWindow.toUpperCase()}</div><div class="b-title">${storm.name}</div><div class="b-sub">${storm.teaser}</div>`, "storm");
  reef.setStorm(0.4);
  await sleep(1800);
  hideBanner();
  reef.setStorm(1);
  reef.lightning();
  await sleep(700);
  const order = [...result.rows].sort((a, b) => a.hit - b.hit);
  const tween = tweenValue(result.start, result.afterHit, 2600, `Storm raging · ${storm.hitWindow}`);
  for (const r of order) {
    reef.setTargets({ [r.id]: 1 + r.hit / 100 }, 1.1);
    reef.popLabel(r.id, signed(r.hit), r.hit >= 0);
    await sleep(260);
  }
  await tween;
  await sleep(900);
  reef.setStorm(0.2);
}

async function regrow(storm, result, sub) {
  reef.setStorm(0);
  for (const r of result.rows) {
    reef.setTargets({ [r.id]: (1 + r.hit / 100) * (1 + r.regrowth / 100) }, 0.9);
    reef.popLabel(r.id, signed(r.regrowth), r.regrowth >= 0);
  }
  await tweenValue(result.afterHit, result.afterRegrowth, 2400, sub);
}

function decide(result, storm) {
  const dlg = $("#decision");
  const lost = result.hitPct;
  $("#decTitle").textContent = lost < 0 ? `Your reef lost ${Math.abs(lost).toFixed(0)}%` : `Your reef grew ${lost.toFixed(0)}%`;
  $("#decText").textContent = `It's ${storm.bottom}. Your ${money(START_VALUE)} reef is now ${money(result.afterHit)}. Nobody knows if the worst is over. Do you stay, or swim for shore?`;
  const headlines = {
    gfc: ["LEHMAN BROTHERS COLLAPSES", "DOW SINKS 777 POINTS IN ONE DAY", "‘WORST CRISIS SINCE THE GREAT DEPRESSION’", "UNEMPLOYMENT HEADS TOWARD 10%"],
    covid: ["MARKETS HALTED AS STOCKS PLUNGE", "WORST DAY SINCE 1987", "LOCKDOWNS SPREAD WORLDWIDE", "OIL PRICES COLLAPSE"],
    rates: ["INFLATION HITS 9.1%", "FED RAISES RATES 0.75 POINT, AGAIN", "BONDS HAVE WORST YEAR IN DECADES", "TECH STOCKS IN BEAR MARKET"],
  }[storm.id];
  $("#decTicker").innerHTML = `<span>${headlines.join("  ·  ")}  ·  ${headlines.join("  ·  ")}</span>`;
  dlg.showModal();
  return new Promise((resolve) => {
    const done = (held) => {
      dlg.close();
      $("#holdBtn").onclick = $("#bailBtn").onclick = null;
      resolve(held);
    };
    $("#holdBtn").onclick = () => done(true);
    $("#bailBtn").onclick = () => done(false);
  });
}

async function unleash(storm) {
  if (state.busy || sim.totalPct(state.mix) !== 100) return;
  lock(true);
  const mix = { ...state.mix };
  const result = sim.runStorm(mix, storm);
  say(`Batten down the hatches! Here comes ${storm.year}…`);
  await stormHit(storm, result);

  const held = await decide(result, storm);
  if (held) {
    banner(`<div class="b-eyebrow">🌱 REGROWTH · ${storm.regrowthWindow.toUpperCase()}</div><div class="b-title">The water clears…</div>`);
    await regrow(storm, result, `Regrowth · ${storm.regrowthWindow}`);
    hideBanner();
  } else {
    reef.setStorm(0);
    reef.setAbandoned(true);
    banner(`<div class="b-eyebrow">🏃 YOU SWAM FOR SHORE</div><div class="b-title">Cash in a chest: ${money(result.afterHit)}</div><div class="b-sub">Meanwhile, the reef you left behind…</div>`);
    await sleep(1800);
    hideBanner();
  }

  const score = sim.scoreStorm(result, storm, held);
  const bio = sim.biodiversity(mix);
  const dom = sim.dominantClass(mix);
  const firstTime = !progress.played[storm.id];
  progress.played[storm.id] = true;
  progress.stars[storm.id] = Math.max(progress.stars[storm.id] || 0, score.stars);
  const xp = 25 + score.stars * 100 + (bio >= 80 ? 50 : 0) + (firstTime ? 25 : 0);
  gainXp(xp);
  if (score.checks[0].ok) award("firstStorm");
  if (dom.weight >= 0.8) award("monoculture");
  if (held && result.hitPct <= -30) award("diamond");
  if (!held) award("panic");
  if (score.stars === 3) award("threeStar");
  if (STORMS.every((s) => (progress.stars[s.id] || 0) >= 1)) award("allStorms");
  save();
  renderProgress();

  const facts = stormFacts(storm, mix, result, score, held, sim);
  showStormResults(storm, result, score, held, xp);
  const target = $("#resBubble");
  target.innerHTML = `🔬 Dr. Inkwell is examining the coral…<span class="caret"></span>`;
  const reply = await askBiologist("storm", facts);
  if ($("#results").open) say(reply.text, reply.source, $("#resBubble"));
  else say(reply.text, reply.source);
}

function bar(pct) {
  const w = Math.min(50, Math.abs(pct) / 2);
  const color = pct >= 0 ? "var(--good)" : "var(--danger)";
  return `<span class="bar"><i style="left:${pct >= 0 ? 50 : 50 - w}%;width:${w}%;background:${color}"></i></span>`;
}

function showStormResults(storm, result, score, held, xp) {
  const nextStorm = STORMS[STORMS.indexOf(storm) + 1];
  const rows = [...result.rows].sort((a, b) => a.hit - b.hit)
    .map((r) => `<tr><td>${SPECIES_BY_ID[r.id].name} <span class="tick">${r.id}</span></td><td>${r.pct}%</td><td class="${r.hit < 0 ? "neg" : "pos"}">${bar(r.hit)}${signed(r.hit)}</td><td class="${r.regrowth < 0 ? "neg" : "pos"}">${signed(r.regrowth)}</td></tr>`)
    .join("");
  $("#resultsBody").innerHTML = `
    <div class="modal-head"><p class="eyebrow">Storm report · ${storm.year}</p><button class="x" type="button" data-close>✕</button></div>
    <h2>${storm.name}</h2>
    <div class="res-stars">${[0, 1, 2].map((i) => `<span class="${i < score.stars ? "on" : ""}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join("")}</div>
    <ul class="checks">${score.checks.map((c) => `<li class="${c.ok ? "ok" : ""}">${c.label}</li>`).join("")}</ul>
    <div class="flow">
      <div><small>Before</small><b>${money(result.start)}</b><em>Calm seas</em></div>
      <div><small>Storm low</small><b>${money(result.afterHit)}</b><em class="${result.hitPct < 0 ? "neg" : "pos"}">${signed(result.hitPct, 1)} · market ${signed(storm.marketHit)}</em></div>
      <div><small>${held ? "After regrowth" : "Sitting in cash"}</small><b>${money(score.finalValue)}</b><em class="${score.finalValue < result.start ? "neg" : "pos"}">${signed((score.finalValue / result.start - 1) * 100, 1)}</em></div>
    </div>
    ${held ? "" : `<p class="note">👻 Had you ridden the current, your reef would have regrown to <b>${money(result.afterRegrowth)}</b> by the end of ${storm.regrowthWindow}.</p>`}
    <div class="res-grid">
      <div>
        <table class="table"><thead><tr><th>Species</th><th>Share</th><th>Storm</th><th>Regrowth</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note">Storm: ${storm.hitWindow}. Regrowth: ${storm.regrowthWindow}. ${storm.proxyNote}</p>
      </div>
      <div class="res-bio">
        <h3>🐙 Dr. Inkwell's diagnosis</h3>
        <div class="bubble" id="resBubble"></div>
        <p class="note">${storm.story}</p>
      </div>
    </div>
    <div class="res-actions">
      <span class="xp-gain">+${xp} XP</span>
      <button class="btn ghost" type="button" data-close>Replant reef</button>
      ${nextStorm ? `<button class="btn storm-btn" type="button" data-next="${nextStorm.id}">Next: ${nextStorm.year} ⚡</button>` : ""}
    </div>`;
  $("#results").showModal();
  raiseToasts();
}

function raiseToasts() {
  const box = $("#toasts");
  if (!box.children.length) return;
  try {
    box.hidePopover();
    box.showPopover();
  } catch { /* ignore */ }
}

function closeResults() {
  if (!$("#results").open && !state.busy) return;
  $("#results").close();
}

$("#results").addEventListener("close", () => {
  reef.heal();
  reef.setAbandoned(false);
  setValue(START_VALUE, "Replanted at full size");
  lock(false);
  if (pendingNext) {
    const storm = STORMS.find((s) => s.id === pendingNext);
    pendingNext = null;
    setTimeout(() => unleash(storm), 900);
  }
});
let pendingNext = null;
$("#results").addEventListener("click", (e) => {
  const next = e.target.closest("[data-next]");
  if (next) pendingNext = next.dataset.next;
  if (next || e.target.closest("[data-close]")) closeResults();
});

// ---------- gauntlet ----------
async function gauntlet() {
  if (state.busy || sim.totalPct(state.mix) !== 100) return;
  lock(true);
  const mix = { ...state.mix };
  const run = sim.runGauntlet(mix);
  say("Three storms, six years, no breaks. Hold on to your shells!");
  let value = START_VALUE;
  for (const leg of run.legs) {
    const result = sim.runStorm(mix, leg.storm, value);
    await stormHit(leg.storm, result);
    banner(`<div class="b-eyebrow">🌱 REGROWTH · ${leg.storm.regrowthWindow.toUpperCase()}</div><div class="b-title">Holding on…</div>`);
    await regrow(leg.storm, result, `Regrowth · ${leg.storm.regrowthWindow}`);
    hideBanner();
    setValue(leg.to, `After ${leg.storm.year} storm, regrowth and fees`);
    value = leg.to;
    reef.heal(1.5);
    reef.setTargets(Object.fromEntries(Object.keys(mix).map((id) => [id, Math.max(0.5, value / START_VALUE)])), 1.5);
    await sleep(1200);
  }
  const survived = run.legs.every((l) => l.hitPct > -50);
  const feeRate = sim.avgFee(mix) / 100;
  const feesPaid = run.legs.reduce((s, l) => s + (l.to / (1 - feeRate) ** 2 - l.to), 0);
  const xp = survived ? 150 + (run.final > run.start ? 100 : 0) : 40;
  gainXp(xp);
  if (survived) award("gauntlet");
  progress.gauntletBest = Math.max(progress.gauntletBest || 0, Math.round(run.final));
  save();
  renderProgress();

  $("#resultsBody").innerHTML = `
    <div class="modal-head"><p class="eyebrow">Gauntlet report</p><button class="x" type="button" data-close>✕</button></div>
    <h2>${survived ? "Your reef survived the Gauntlet" : "The Gauntlet broke your reef"}</h2>
    <div class="flow">
      <div><small>Planted</small><b>${money(run.start)}</b><em>2008</em></div>
      <div><small>Fees paid</small><b>${money(feesPaid)}</b><em>${sim.avgFee(mix).toFixed(2)}% a year</em></div>
      <div><small>Final reef</small><b>${money(run.final)}</b><em class="${run.final < run.start ? "neg" : "pos"}">${signed((run.final / run.start - 1) * 100, 1)}</em></div>
    </div>
    <div class="legs">${run.legs.map((l) => `<div class="leg"><b>${l.storm.year}</b><span>${l.storm.name}<br><small class="${l.hitPct < 0 ? "neg" : "pos"}">storm ${signed(l.hitPct, 1)}</small></span><span>${money(l.from)} → ${money(l.to)}</span></div>`).join("")}</div>
    <div class="res-bio"><h3>🐙 Dr. Inkwell's diagnosis</h3><div class="bubble" id="resBubble"></div></div>
    <p class="note">Storm years only: the calm years in between are skipped, and the reef is replanted to the same mix after each storm.</p>
    <div class="res-actions"><span class="xp-gain">+${xp} XP</span><button class="btn ghost" type="button" data-close>Back to the reef</button></div>`;
  $("#results").showModal();
  raiseToasts();
  $("#resBubble").innerHTML = `🔬 Reviewing six years of reef samples…<span class="caret"></span>`;
  const facts = {
    start: run.start,
    final: Math.round(run.final),
    feesPaid: Math.round(feesPaid),
    biodiversity: sim.biodiversity(mix),
    avgFee: sim.avgFee(mix),
    reef: Object.entries(mix).map(([id, pct]) => ({ ticker: id, species: SPECIES_BY_ID[id].name, assetClass: CLASSES[SPECIES_BY_ID[id].cls].label, pct })),
    legs: run.legs.map((l) => ({ year: l.storm.year, name: l.storm.name, hitPct: Math.round(l.hitPct * 10) / 10, from: Math.round(l.from), to: Math.round(l.to) })),
  };
  const reply = await askBiologist("gauntlet", facts);
  say(reply.text, reply.source, $("#results").open ? $("#resBubble") : $("#bubble"));
}

// ---------- fee lab ----------
async function feeLab() {
  if (state.busy || sim.totalPct(state.mix) !== 100) return;
  lock(true);
  const mix = { ...state.mix };
  const fee = sim.avgFee(mix);
  const baseMurk = sim.murk(fee);
  say("Thirty years, no storms, just growth and fees. Watch the water…");
  const years = 30;
  for (let y = 0; y <= years; y++) {
    const p = sim.feeProjection(fee, y);
    reef.setMurk(Math.min(1, baseMurk * (0.3 + (y / years) * 1.4)));
    reef.setTargets(Object.fromEntries(Object.keys(mix).map((id) => [id, Math.min(2.6, 1 + (p.polluted / START_VALUE - 1) * 0.25)])), 3);
    setValue(p.polluted, `Year ${y} of ${years} · calm seas at 7%`, "up");
    banner(`<div class="b-eyebrow">⏳ FEE LAB · YEAR ${y}</div><div class="b-big"><span>Your reef<b>${money(p.polluted)}</b></span><span>Zero-fee twin<b>${money(p.clean)}</b></span><span>Fees siphoned<b class="neg">${money(p.lost)}</b></span></div>`);
    await sleep(y === years ? 1400 : 170);
  }
  hideBanner();
  const p = sim.feeProjection(fee, years);
  if (award("feeLab")) gainXp(50);
  save();
  renderProgress();
  const reply = await askBiologist("fees", { avgFee: fee, years, rate: 7, clean: Math.round(p.clean), polluted: Math.round(p.polluted), lost: Math.round(p.lost), reef: Object.entries(mix).map(([id, pct]) => ({ ticker: id, fee: SPECIES_BY_ID[id].fee, pct })) });
  await say(reply.text, reply.source);
  reef.heal();
  reef.setMurk(baseMurk);
  setValue(START_VALUE, "Back to the present");
  lock(false);
}

// ---------- tooltip ----------
reef.onHover((id, x, y) => {
  const tip = $("#tooltip");
  if (!id) {
    tip.hidden = true;
    return;
  }
  const sp = SPECIES_BY_ID[id];
  tip.innerHTML = `<b>${sp.name}</b> <span class="tick">${sp.id}</span><div class="tt-row"><span>${sp.fund}</span></div>
    <div class="tt-row"><span>Asset class</span><span>${CLASSES[sp.cls].label}</span></div>
    <div class="tt-row"><span>Share of reef</span><span>${state.mix[id] ?? 0}%</span></div>
    <div class="tt-row"><span>Yearly fee</span><span>${sp.fee.toFixed(2)}%</span></div>
    <div style="margin-top:6px;color:var(--muted)">${sp.blurb}</div>`;
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(x + 16, window.innerWidth - w - 12)}px`;
  tip.style.top = `${y + 16}px`;
});

// ---------- wire up ----------
buildCatalog();
buildStorms();
$("#badgesBtn").addEventListener("click", showBadges);
$("#badgesDlg").addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === $("#badgesDlg")) $("#badgesDlg").close(); });
$("#decision").addEventListener("cancel", (e) => e.preventDefault());
$("#gauntletBtn").addEventListener("click", gauntlet);
$("#feeBtn").addEventListener("click", feeLab);
$("#askForm").addEventListener("submit", onAsk);
setMix({ ...PRESETS[0].mix }, true);
