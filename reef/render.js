// Canvas reef. Each species is drawn procedurally; health bleaches it, fees cloud the water,
// storms darken the sea and whip the current.
import { SPECIES_BY_ID } from "./data.js";

const TAU = Math.PI * 2;
const SWIMMERS = new Set(["lionfish", "jelly", "fish", "turtle", "seahorse"]);
const BONE = [236, 232, 224];
const DEAD = [118, 118, 112];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lighten = (c, k) => mixc(c, [255, 255, 255], k);
const darken = (c, k) => mixc(c, [0, 0, 0], k);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- coral & creature painters. (x, y) is the base on the sea floor ----------

function brain(c, x, y, s, col, env) {
  const R = 36 * s;
  const H = R * 0.8;
  const g = c.createRadialGradient(x - R * 0.3, y - H * 0.9, R * 0.1, x, y - H * 0.4, R * 1.2);
  g.addColorStop(0, css(lighten(col, 0.35)));
  g.addColorStop(1, css(darken(col, 0.3)));
  c.save();
  c.beginPath();
  c.ellipse(x, y, R, H, 0, Math.PI, TAU);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  c.clip();
  c.strokeStyle = css(darken(col, 0.42), 0.75);
  c.lineWidth = Math.max(1, 2.2 * s);
  for (let i = 0; i < 7; i++) {
    const yy = y - H + ((i + 0.6) * H) / 7;
    c.beginPath();
    for (let xx = x - R, first = true; xx <= x + R; xx += 3, first = false) {
      const yv = yy + Math.sin((xx - x) * (0.2 / s) + i * 1.7 + env.t * 0.2) * 3 * s;
      first ? c.moveTo(xx, yv) : c.lineTo(xx, yv);
    }
    c.stroke();
  }
  c.restore();
}

function staghorn(c, x, y, s, col, env, seed) {
  const r = rng(seed);
  c.lineCap = "round";
  const branch = (x0, y0, ang, len, w, d) => {
    const a = ang + Math.sin(env.t * 1.3 + d * 0.9 + (seed % 7)) * 0.04 * env.sway * (d + 1) * 0.5;
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    c.strokeStyle = css(mixc(darken(col, 0.25), lighten(col, 0.25), d / 4));
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    if (d < 3) {
      const kids = r() < 0.5 ? 2 : 3;
      for (let i = 0; i < kids; i++) branch(x1, y1, a + (r() - 0.5) * 1.1, len * (0.66 + r() * 0.12), w * 0.72, d + 1);
    } else {
      c.fillStyle = css(lighten(col, 0.55));
      c.beginPath();
      c.arc(x1, y1, w * 0.7, 0, TAU);
      c.fill();
    }
  };
  for (let i = 0; i < 3; i++) branch(x + (i - 1) * 10 * s, y, -Math.PI / 2 + (i - 1) * 0.4, 30 * s, 7 * s, 0);
}

function firecoral(c, x, y, s, col, env, seed) {
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const bx = x + (i - 2) * 11 * s;
    const h = (40 + r() * 34) * s;
    const w = (9 + r() * 5) * s;
    const lean = Math.sin(env.t * 1.1 + i) * 0.04 * env.sway * h;
    const g = c.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, css(darken(col, 0.35)));
    g.addColorStop(0.7, css(col));
    g.addColorStop(1, css(lighten(mixc(col, [255, 230, 120], 0.6), 0.2)));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(bx - w / 2, y);
    c.quadraticCurveTo(bx - w / 2 + lean * 0.5, y - h * 0.6, bx + lean - w * 0.3, y - h);
    c.quadraticCurveTo(bx + lean, y - h - 6 * s, bx + lean + w * 0.3, y - h);
    c.quadraticCurveTo(bx + w / 2 + lean * 0.5, y - h * 0.6, bx + w / 2, y);
    c.closePath();
    c.fill();
  }
}

function anemone(c, x, y, s, col, env, seed) {
  const R = 26 * s;
  c.fillStyle = css(darken(col, 0.4));
  c.beginPath();
  c.moveTo(x - R * 0.5, y);
  c.quadraticCurveTo(x - R * 0.35, y - R * 0.5, x - R * 0.45, y - R * 0.85);
  c.lineTo(x + R * 0.45, y - R * 0.85);
  c.quadraticCurveTo(x + R * 0.35, y - R * 0.5, x + R * 0.5, y);
  c.closePath();
  c.fill();
  c.lineCap = "round";
  const N = 17;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const bx = x + (f - 0.5) * R * 0.9;
    const by = y - R * 0.85;
    const len = R * (1.05 + 0.35 * Math.sin(i * 2.3 + seed));
    const sw = Math.sin(env.t * 2 + i * 0.5 + seed) * 0.25 * env.sway;
    const dir = -Math.PI / 2 + (f - 0.5) * 2.3 + sw;
    const tx = bx + Math.cos(dir) * len;
    const ty = by + Math.sin(dir) * len;
    const mx = bx + Math.cos(dir - sw) * len * 0.5;
    const my = by + Math.sin(dir - sw) * len * 0.5;
    c.strokeStyle = css(lighten(col, 0.1 + f * 0.15));
    c.lineWidth = 4.5 * s;
    c.beginPath();
    c.moveTo(bx, by);
    c.quadraticCurveTo(mx, my, tx, ty);
    c.stroke();
    c.fillStyle = css(lighten(col, 0.65));
    c.beginPath();
    c.arc(tx, ty, 2.8 * s, 0, TAU);
    c.fill();
  }
}

function fan(c, x, y, s, col, env, seed) {
  const cy = y - 14 * s;
  c.strokeStyle = css(darken(col, 0.35));
  c.lineWidth = 4 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, cy);
  c.stroke();
  const N = 13;
  const rot = Math.sin(env.t * 0.9 + seed) * 0.05 * env.sway;
  const tips = [];
  for (let i = 0; i < N; i++) {
    const a = -Math.PI * 0.92 + (i / (N - 1)) * Math.PI * 0.84 + rot;
    const len = 72 * s * (0.86 + 0.14 * Math.sin(i * 1.9 + seed));
    tips.push([a, len]);
  }
  const pt = (i, k) => [x + Math.cos(tips[i][0]) * tips[i][1] * k, cy + Math.sin(tips[i][0]) * tips[i][1] * k];
  c.fillStyle = css(col, 0.28);
  c.beginPath();
  c.moveTo(x, cy);
  tips.forEach((_, i) => c.lineTo(...pt(i, 1)));
  c.closePath();
  c.fill();
  c.strokeStyle = css(col, 0.95);
  c.lineWidth = 2 * s;
  tips.forEach((_, i) => {
    c.beginPath();
    c.moveTo(x, cy);
    c.lineTo(...pt(i, 1));
    c.stroke();
  });
  c.strokeStyle = css(lighten(col, 0.3), 0.6);
  c.lineWidth = Math.max(0.8, 1 * s);
  for (const k of [0.35, 0.55, 0.75, 0.92]) {
    c.beginPath();
    tips.forEach((_, i) => (i ? c.lineTo(...pt(i, k)) : c.moveTo(...pt(i, k))));
    c.stroke();
  }
}

function grass(c, x, y, s, col, env, seed) {
  c.lineCap = "round";
  for (let i = 0; i < 11; i++) {
    const bx = x + (i - 5) * 5 * s;
    const h = (55 + ((i * 37 + seed) % 28)) * s;
    const sw = Math.sin(env.t * 1.6 + i * 0.6 + seed) * (7 + 9 * env.sway) * s;
    c.strokeStyle = css(mixc(darken(col, 0.3), lighten(col, 0.15), (i % 4) / 3));
    c.lineWidth = 3.6 * s;
    c.beginPath();
    c.moveTo(bx, y);
    c.quadraticCurveTo(bx + sw * 0.3, y - h * 0.5, bx + sw, y - h);
    c.stroke();
  }
}

function sponge(c, x, y, s, col) {
  for (const j of [-1, 1]) {
    const bx = x + j * 13 * s;
    const h = (j < 0 ? 62 : 44) * s;
    const wt = (j < 0 ? 17 : 13) * s;
    const wb = wt * 0.75;
    const g = c.createLinearGradient(bx - wt, 0, bx + wt, 0);
    g.addColorStop(0, css(darken(col, 0.35)));
    g.addColorStop(0.45, css(lighten(col, 0.15)));
    g.addColorStop(1, css(darken(col, 0.4)));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(bx - wb, y);
    c.quadraticCurveTo(bx - wt * 1.2, y - h * 0.5, bx - wt, y - h);
    c.lineTo(bx + wt, y - h);
    c.quadraticCurveTo(bx + wt * 1.2, y - h * 0.5, bx + wb, y);
    c.closePath();
    c.fill();
    c.strokeStyle = css(darken(col, 0.3), 0.5);
    c.lineWidth = Math.max(1, 1.4 * s);
    for (let k = 1; k < 5; k++) {
      const yy = y - (h * k) / 5;
      c.beginPath();
      c.moveTo(bx - wt * 0.95, yy);
      c.quadraticCurveTo(bx, yy + 4 * s, bx + wt * 0.95, yy);
      c.stroke();
    }
    c.fillStyle = css(darken(col, 0.6));
    c.beginPath();
    c.ellipse(bx, y - h, wt, wt * 0.32, 0, 0, TAU);
    c.fill();
    c.strokeStyle = css(lighten(col, 0.25));
    c.lineWidth = 2 * s;
    c.stroke();
  }
}

function clam(c, x, y, s, col, env, seed) {
  const R = 34 * s;
  const hinge = y - R * 0.22;
  const gap = (5 + 2.5 * Math.sin(env.t * 1.2 + seed)) * s * (1 - env.storm * 0.85);
  const shell = mixc([214, 204, 184], col, 0.12);
  c.fillStyle = css(darken(shell, 0.12));
  c.beginPath();
  c.ellipse(x, hinge, R, R * 0.5, 0, 0, Math.PI);
  c.closePath();
  c.fill();
  // mantle peeks out of the gap
  c.fillStyle = css(col);
  c.beginPath();
  c.moveTo(x - R, hinge);
  for (let i = 0; i <= 16; i++) {
    const xx = x - R + (i / 16) * 2 * R;
    c.lineTo(xx, hinge - gap - (i % 2 ? 4 * s : 0));
  }
  c.lineTo(x + R, hinge);
  c.closePath();
  c.fill();
  c.fillStyle = css(lighten(col, 0.6), 0.8);
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(x - R * 0.7 + i * R * 0.28, hinge - gap * 0.4, 1.6 * s, 0, TAU);
    c.fill();
  }
  c.save();
  c.beginPath();
  c.ellipse(x, hinge - gap, R, R * 0.55, 0, Math.PI, TAU);
  c.closePath();
  const g = c.createLinearGradient(0, hinge - gap - R * 0.55, 0, hinge - gap);
  g.addColorStop(0, css(lighten(shell, 0.3)));
  g.addColorStop(1, css(darken(shell, 0.05)));
  c.fillStyle = g;
  c.fill();
  c.clip();
  c.strokeStyle = css(darken(shell, 0.28), 0.7);
  c.lineWidth = Math.max(1, 2 * s);
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(x, hinge - gap + 4 * s);
    c.lineTo(x + i * R * 0.34, hinge - gap - R * 0.6);
    c.stroke();
  }
  c.restore();
}

function fish(c, x, y, s, col, dir, env, seed) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const L = 30 * s;
  const H = 12 * s;
  const wag = Math.sin(env.t * 9 + seed) * 0.3;
  c.fillStyle = css(darken(col, 0.2));
  c.beginPath();
  c.moveTo(-L * 0.8, 0);
  c.lineTo(-L * 1.3, -H * 0.9 + wag * H);
  c.lineTo(-L * 1.15, 0);
  c.lineTo(-L * 1.3, H * 0.9 + wag * H);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(-L * 0.5, -H * 0.8);
  c.quadraticCurveTo(0, -H * 1.7, L * 0.4, -H * 0.8);
  c.fill();
  const g = c.createLinearGradient(0, -H, 0, H);
  g.addColorStop(0, css(lighten(col, 0.25)));
  g.addColorStop(1, css(mixc(col, [70, 140, 255], 0.35)));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, L, H, 0, 0, TAU);
  c.fill();
  c.strokeStyle = css(lighten(col, 0.5), 0.5);
  c.lineWidth = Math.max(1, 1.3 * s);
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.arc(i * L * 0.3, 0, H * 0.9, -0.9, 0.9);
    c.stroke();
  }
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(L * 0.6, -H * 0.2, 3 * s, 0, TAU);
  c.fill();
  c.fillStyle = "#111";
  c.beginPath();
  c.arc(L * 0.65, -H * 0.2, 1.5 * s, 0, TAU);
  c.fill();
  c.restore();
}

function lionfish(c, x, y, s, col, dir, env, seed) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const L = 24 * s;
  const H = 12 * s;
  c.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + i * 0.18 + Math.sin(env.t * 2 + i + seed) * 0.05;
    c.strokeStyle = i % 2 ? "rgba(255,240,230,0.9)" : css(col);
    c.lineWidth = 1.6 * s;
    c.beginPath();
    c.moveTo(-L * 0.4 + i * L * 0.12, -H * 0.6);
    c.lineTo(-L * 0.4 + i * L * 0.12 + Math.cos(a) * 20 * s, -H * 0.6 + Math.sin(a) * 22 * s);
    c.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.55 + i * 0.16 + Math.sin(env.t * 2.4 + i) * 0.08;
    c.strokeStyle = css(col, 0.75);
    c.lineWidth = 1.2 * s;
    c.beginPath();
    c.moveTo(0, H * 0.3);
    c.lineTo(Math.cos(a) * 24 * s, H * 0.3 + Math.sin(a) * 18 * s);
    c.stroke();
  }
  c.save();
  c.beginPath();
  c.ellipse(0, 0, L, H, 0, 0, TAU);
  c.fillStyle = css(col);
  c.fill();
  c.clip();
  c.fillStyle = "rgba(255,245,235,0.85)";
  for (let i = -3; i <= 3; i++) c.fillRect(i * L * 0.3 - 2 * s, -H, 3.5 * s, H * 2);
  c.restore();
  c.fillStyle = css(darken(col, 0.2));
  c.beginPath();
  c.moveTo(-L * 0.9, 0);
  c.lineTo(-L * 1.35, -H * 0.7);
  c.lineTo(-L * 1.35, H * 0.7);
  c.closePath();
  c.fill();
  c.fillStyle = "#111";
  c.beginPath();
  c.arc(L * 0.62, -H * 0.15, 1.8 * s, 0, TAU);
  c.fill();
  c.restore();
}

function jelly(c, x, y, s, col, dir, env, seed) {
  const p = 1 + 0.12 * Math.sin(env.t * 3 + seed);
  const R = 18 * s;
  c.strokeStyle = css(col, 0.6);
  c.lineWidth = 1.6 * s;
  for (let i = 0; i < 6; i++) {
    const bx = x - R * 0.7 + (i * R * 1.4) / 5;
    c.beginPath();
    c.moveTo(bx, y);
    for (let k = 1; k <= 8; k++) {
      c.lineTo(bx + Math.sin(env.t * 2.5 + k * 0.8 + i) * 4 * s * (1 + env.sway * 0.4), y + k * 5.5 * s);
    }
    c.stroke();
  }
  const g = c.createRadialGradient(x, y - R * 0.5, 1, x, y - R * 0.3, R * 1.3);
  g.addColorStop(0, css(lighten(col, 0.6), 0.85));
  g.addColorStop(1, css(col, 0.25));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(x, y, R * p, (R * 0.9) / p, 0, Math.PI, TAU);
  c.closePath();
  c.fill();
  c.strokeStyle = css(lighten(col, 0.4), 0.9);
  c.lineWidth = 1.2 * s;
  c.stroke();
}

function turtle(c, x, y, s, col, dir, env, seed) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const L = 30 * s;
  const skin = mixc(col, [150, 170, 110], 0.55);
  const flap = Math.sin(env.t * 2.4 + seed) * 0.5;
  c.fillStyle = css(darken(skin, 0.1));
  for (const [fx, fy, base, k] of [
    [L * 0.45, -L * 0.35, -0.6, 1],
    [L * 0.45, L * 0.35, 0.6, -1],
    [-L * 0.55, -L * 0.3, -2.4, 1],
    [-L * 0.55, L * 0.3, 2.4, -1],
  ]) {
    c.save();
    c.translate(fx, fy);
    c.rotate(base + flap * k * 0.6);
    c.beginPath();
    c.ellipse(L * 0.3, 0, L * 0.4, L * 0.12, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.beginPath();
  c.arc(L * 0.95, 0, L * 0.2, 0, TAU);
  c.fill();
  c.fillStyle = "#111";
  c.beginPath();
  c.arc(L * 1.05, -L * 0.06, 1.6 * s, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(-L * 0.1, -L * 0.15, 1, 0, 0, L);
  g.addColorStop(0, css(lighten(col, 0.3)));
  g.addColorStop(1, css(darken(col, 0.35)));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, L * 0.75, L * 0.55, 0, 0, TAU);
  c.fill();
  c.strokeStyle = css(darken(col, 0.45), 0.6);
  c.lineWidth = Math.max(1, 1.4 * s);
  for (const [hx, hy] of [[0, 0], [-L * 0.35, -L * 0.2], [-L * 0.35, L * 0.2], [L * 0.32, -L * 0.2], [L * 0.32, L * 0.2]]) {
    c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU;
      const px = hx + Math.cos(a) * L * 0.17;
      const py = hy + Math.sin(a) * L * 0.15;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
  }
  c.restore();
}

function seahorse(c, x, y, s, col, dir, env) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const pts = [];
  const bez = (t, a, b, cc, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * cc + t ** 3 * d;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push([bez(t, 0, 16, 12, -2) * s, bez(t, -26, -10, 16, 22) * s, lerp(7.5, 2.6, t) * s]);
  }
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 1.4;
    pts.push([(-2 - Math.sin(a) * 7) * s, (22 + (1 - Math.cos(a)) * 5) * s, lerp(2.6, 1.4, i / 10) * s]);
  }
  c.fillStyle = css(darken(col, 0.15));
  c.beginPath();
  c.moveTo(4 * s, -16 * s);
  c.quadraticCurveTo(-8 * s, -6 * s, 2 * s, 6 * s);
  c.closePath();
  c.fill();
  c.fillStyle = css(col);
  for (const [px, py, r] of pts) {
    c.beginPath();
    c.arc(px, py, r, 0, TAU);
    c.fill();
  }
  c.fillStyle = css(lighten(col, 0.3));
  c.beginPath();
  c.arc(2 * s, -28 * s, 6.5 * s, 0, TAU);
  c.fill();
  c.strokeStyle = css(lighten(col, 0.3));
  c.lineWidth = 3.4 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(6 * s, -27 * s);
  c.lineTo(15 * s, -24 * s);
  c.stroke();
  c.fillStyle = "#111";
  c.beginPath();
  c.arc(4 * s, -29.5 * s, 1.4 * s, 0, TAU);
  c.fill();
  c.restore();
}

const PAINT = { brain, staghorn, firecoral, anemone, fan, grass, sponge, clam, fish, lionfish, jelly, turtle, seahorse };

// Small static portrait for the nursery cards.
export function paintThumb(canvas, id) {
  const sp = SPECIES_BY_ID[id];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 56;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const env = { t: 0.6, sway: 1, storm: 0 };
  const col = hex(sp.color);
  if (SWIMMERS.has(sp.shape)) {
    const y = sp.shape === "seahorse" ? 32 : sp.shape === "jelly" ? 26 : 29;
    PAINT[sp.shape](c, sp.shape === "fish" || sp.shape === "lionfish" ? 31 : 28, y, 0.62, col, 1, env, 7);
  } else {
    c.fillStyle = "rgba(194,164,106,0.55)";
    c.fillRect(0, 50, size, 6);
    PAINT[sp.shape](c, 28, 52, 0.55, col, env, 11);
  }
}

// ---------- the scene ----------

export class Reef {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext("2d");
    this.items = new Map();
    this.t = 0;
    this.storm = 0;
    this.stormTarget = 0;
    this.murk = 0;
    this.murkTarget = 0;
    this.flash = 0;
    this.abandoned = 0;
    this.abandonTarget = 0;
    this.biodiversity = 0;
    this.labels = [];
    this.bubbles = [];
    this.motes = [];
    this.streaks = [];
    this.school = [];
    this.hoverCb = null;
    this.last = performance.now();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("mousemove", (e) => this.hover(e));
    canvas.addEventListener("mouseleave", () => this.hoverCb?.(null));
    requestAnimationFrame((now) => this.loop(now));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setMix(mix) {
    for (const [id, pct] of Object.entries(mix)) {
      const item = this.items.get(id);
      if (item) {
        item.pct = pct;
        item.leaving = false;
      } else {
        this.items.set(id, { id, pct, mult: 1, target: 1, speed: 2, appear: 0, dead: 0, seed: (Math.random() * 1e6) | 0 });
      }
    }
    for (const item of this.items.values()) if (!(item.id in mix)) item.leaving = true;
  }

  setTargets(targets, speed = 1.2) {
    for (const [id, target] of Object.entries(targets)) {
      const item = this.items.get(id);
      if (item) Object.assign(item, { target, speed });
    }
  }

  heal(speed = 2.5) {
    for (const item of this.items.values()) Object.assign(item, { target: 1, speed });
  }

  setStorm(v) { this.stormTarget = v; }
  setMurk(v) { this.murkTarget = v; }
  setBiodiversity(v) { this.biodiversity = v; }
  setAbandoned(on) { this.abandonTarget = on ? 1 : 0; }
  lightning() { this.flash = 1; }
  onHover(cb) { this.hoverCb = cb; }

  popLabel(id, text, good) {
    const slot = this.slotOf(id);
    if (!slot) return;
    this.labels.push({ x: slot.x, y: this.floorY - 110 * this.k, text, good, life: 1 });
  }

  get floorY() { return this.h * 0.84; }
  get k() { return clamp(this.h / 480, 0.6, 1.4); }

  slots() {
    const ids = [...this.items.keys()];
    const n = ids.length;
    const margin = Math.min(70, this.w * 0.08);
    const span = this.w - margin * 2;
    return ids.map((id, i) => ({ id, x: margin + (span * (i + 0.5)) / n, w: span / n }));
  }

  slotOf(id) { return this.slots().find((s) => s.id === id); }

  hover(e) {
    if (!this.hoverCb) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const slot = this.slots().find((s) => Math.abs(s.x - x) < s.w / 2);
    this.hoverCb(slot && y > this.h * 0.12 ? slot.id : null, e.clientX, e.clientY);
  }

  colorFor(item) {
    const base = hex(SPECIES_BY_ID[item.id].color);
    const m = item.mult;
    let col = base;
    if (m < 1) col = mixc(base, BONE, clamp((1 - m) / 0.55, 0, 1) * 0.85);
    if (item.dead > 0) col = mixc(col, DEAD, item.dead);
    if (this.abandoned > 0) col = mixc(col, [90, 110, 130], this.abandoned * 0.7);
    return col;
  }

  loop(now) {
    const raw = Math.min(1, (now - this.last) / 1000);
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.t += dt;
    this.step(dt, raw);
    this.draw();
    requestAnimationFrame((n) => this.loop(n));
  }

  // dt drives motion; raw (real elapsed time) drives state easing so throttled tabs still settle.
  step(dt, raw) {
    this.storm += (this.stormTarget - this.storm) * Math.min(1, raw * 1.8);
    this.murk += (this.murkTarget - this.murk) * Math.min(1, raw * 1.5);
    this.abandoned += (this.abandonTarget - this.abandoned) * Math.min(1, raw * 2);
    this.flash = Math.max(0, this.flash - dt * 2.8);
    if (this.storm > 0.6 && Math.random() < dt * 0.7 * this.storm) this.lightning();

    for (const item of [...this.items.values()]) {
      item.mult += (item.target - item.mult) * Math.min(1, raw * item.speed);
      item.appear = clamp(item.appear + (item.leaving ? -raw * 3 : raw * 2.2), 0, 1);
      item.dead = clamp(item.dead + (item.mult < 0.45 ? raw : -raw * 2), 0, 1);
      if (item.leaving && item.appear <= 0) this.items.delete(item.id);
    }

    const slots = this.slots();
    if (slots.length && Math.random() < dt * (2 + slots.length * 0.6) * (1 - this.abandoned)) {
      const s = slots[(Math.random() * slots.length) | 0];
      this.bubbles.push({ x: s.x + (Math.random() - 0.5) * 30, y: this.floorY - 40 * this.k, r: 1.5 + Math.random() * 3.5, v: 25 + Math.random() * 30, p: Math.random() * TAU });
    }
    this.bubbles = this.bubbles.filter((b) => (b.y -= b.v * dt) > this.h * 0.08);

    const moteGoal = Math.round(this.murk * 90);
    while (this.motes.length < moteGoal) this.motes.push({ x: Math.random() * this.w, y: Math.random() * this.floorY, r: 1 + Math.random() * 2.5, p: Math.random() * TAU });
    this.motes.length = Math.min(this.motes.length, moteGoal);
    for (const m of this.motes) {
      m.x += (Math.sin(this.t * 0.4 + m.p) * 6 + this.storm * 160) * dt;
      m.y += Math.cos(this.t * 0.3 + m.p) * 4 * dt;
      if (m.x > this.w) m.x = 0;
    }

    const streakGoal = Math.round(this.storm * 70);
    while (this.streaks.length < streakGoal) this.streaks.push({ x: Math.random() * this.w, y: Math.random() * this.floorY, l: 20 + Math.random() * 60, v: 300 + Math.random() * 500 });
    this.streaks.length = Math.min(this.streaks.length, streakGoal);
    for (const s of this.streaks) if ((s.x += s.v * dt) > this.w + s.l) s.x = -s.l;

    const schoolGoal = this.items.size ? Math.round(3 + (this.biodiversity / 100) * 22) : 0;
    const palette = ["#fde68a", "#a5f3fc", "#fbcfe8", "#bbf7d0", "#fed7aa", "#c7d2fe"];
    while (this.school.length < schoolGoal) {
      this.school.push({ x: Math.random() * this.w, y: this.h * (0.2 + Math.random() * 0.45), v: (30 + Math.random() * 40) * (Math.random() < 0.5 ? -1 : 1), p: Math.random() * TAU, col: palette[(Math.random() * palette.length) | 0] });
    }
    this.school.length = Math.min(this.school.length, schoolGoal);
    for (const f of this.school) {
      f.x += f.v * (1 + this.storm * 4) * dt;
      if (f.x < -20) f.x = this.w + 20;
      if (f.x > this.w + 20) f.x = -20;
    }

    for (const l of this.labels) {
      l.life -= dt * 0.45;
      l.y -= 22 * dt;
    }
    this.labels = this.labels.filter((l) => l.life > 0);
  }

  draw() {
    const { c, w, h } = this;
    const k = this.k;
    const storm = this.storm;
    const env = { t: this.t, sway: 1 + storm * 5, storm };
    c.save();
    if (storm > 0.05) c.translate((Math.random() - 0.5) * storm * 5, (Math.random() - 0.5) * storm * 3);

    // water column
    const top = mixc([18, 120, 170], [30, 40, 60], storm);
    const mid = mixc([8, 70, 120], [16, 26, 44], storm);
    const bottom = mixc([3, 24, 48], [5, 10, 20], storm);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(top));
    g.addColorStop(0.5, css(mid));
    g.addColorStop(1, css(bottom));
    c.fillStyle = g;
    c.fillRect(-10, -10, w + 20, h + 20);

    // light rays
    const rayAlpha = 0.07 * (1 - storm) * (1 - this.murk * 0.7);
    if (rayAlpha > 0.005) {
      for (let i = 0; i < 6; i++) {
        const x0 = ((i + 0.5) / 6) * w + Math.sin(this.t * 0.3 + i) * 40;
        c.fillStyle = `rgba(200,240,255,${rayAlpha})`;
        c.beginPath();
        c.moveTo(x0 - 18, 0);
        c.lineTo(x0 + 18, 0);
        c.lineTo(x0 + 90 + i * 8, h);
        c.lineTo(x0 - 30 + i * 8, h);
        c.closePath();
        c.fill();
      }
    }

    // surface
    const surf = h * 0.07;
    const amp = 4 + storm * 16;
    c.fillStyle = css(mixc([150, 215, 245], [70, 80, 95], storm), 0.35);
    c.beginPath();
    c.moveTo(-10, -10);
    for (let x = -10; x <= w + 10; x += 8) c.lineTo(x, surf + Math.sin(x * 0.02 + this.t * (1.5 + storm * 3)) * amp + Math.sin(x * 0.051 - this.t * 2) * amp * 0.4);
    c.lineTo(w + 10, -10);
    c.closePath();
    c.fill();

    // ambient reef fish (more biodiversity, more life)
    for (const f of this.school) {
      const y = f.y + Math.sin(this.t * 1.5 + f.p) * 8;
      const d = Math.sign(f.v);
      c.fillStyle = f.col;
      c.globalAlpha = 0.75 * (1 - this.abandoned * 0.8);
      c.beginPath();
      c.ellipse(f.x, y, 6 * k, 2.6 * k, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(f.x - d * 5 * k, y);
      c.lineTo(f.x - d * 10 * k, y - 3 * k);
      c.lineTo(f.x - d * 10 * k, y + 3 * k);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }

    // sea floor
    const fy = this.floorY;
    c.fillStyle = css(mixc([194, 164, 106], [90, 80, 64], storm * 0.6));
    c.beginPath();
    c.moveTo(-10, h + 10);
    c.lineTo(-10, fy + 6);
    for (let x = 0; x <= w + 10; x += 20) c.lineTo(x, fy + 6 + Math.sin(x * 0.013) * 7 + Math.sin(x * 0.041) * 3);
    c.lineTo(w + 10, h + 10);
    c.closePath();
    c.fill();
    c.fillStyle = css(mixc([160, 132, 84], [70, 62, 50], storm * 0.6));
    c.beginPath();
    c.moveTo(-10, h + 10);
    for (let x = -10; x <= w + 10; x += 20) c.lineTo(x, fy + 26 + Math.sin(x * 0.02 + 1) * 6);
    c.lineTo(w + 10, h + 10);
    c.closePath();
    c.fill();

    if (!this.items.size) {
      c.fillStyle = "rgba(220,245,255,0.75)";
      c.font = `600 ${Math.round(17 * k)}px "Fredoka", system-ui, sans-serif`;
      c.textAlign = "center";
      c.fillText("Barren seabed. Plant species from the nursery to grow your reef.", w / 2, h * 0.45);
    }

    // species
    for (const slot of this.slots()) {
      const item = this.items.get(slot.id);
      const sp = SPECIES_BY_ID[slot.id];
      const col = this.colorFor(item);
      const vis = Math.min(item.mult, 2.6);
      const s = (0.45 + Math.sqrt(item.pct / 100)) * (0.55 + 0.45 * vis) * item.appear * k * clamp(slot.w / 110, 0.55, 1.15);
      c.globalAlpha = item.appear * (1 - this.abandoned * 0.65);

      if (item.mult > 1.04) {
        const glow = clamp((item.mult - 1) / 1.2, 0, 1);
        const gr = c.createRadialGradient(slot.x, fy - 40 * s, 1, slot.x, fy - 40 * s, 90 * s);
        gr.addColorStop(0, css(hex(sp.color), 0.35 * glow));
        gr.addColorStop(1, css(hex(sp.color), 0));
        c.fillStyle = gr;
        c.fillRect(slot.x - 100 * s, fy - 140 * s, 200 * s, 160 * s);
      }

      if (SWIMMERS.has(sp.shape)) {
        const count = 1 + Math.floor(item.pct / 25);
        for (let i = 0; i < count; i++) {
          const seed = item.seed + i * 97;
          const range = Math.max(10, slot.w * 0.35);
          const speed = 0.35 + (seed % 13) / 40;
          const phase = this.t * speed * (1 + storm * 1.5) + seed;
          let x = slot.x + Math.sin(phase) * range;
          const dir = Math.cos(phase) >= 0 ? 1 : -1;
          const band = sp.shape === "jelly" ? 0.28 : sp.shape === "turtle" ? 0.38 : 0.5;
          let y = h * (band + ((i * 0.11) % 0.25)) + Math.sin(this.t * 0.8 + seed) * 10 * k;
          if (storm > 0.1) {
            x += (Math.random() - 0.5) * storm * 6;
            y += (Math.random() - 0.5) * storm * 6;
          }
          y = lerp(y, fy - 8 * k, item.dead);
          c.save();
          if (item.dead > 0.5) {
            c.translate(x, y);
            c.scale(1, -1);
            c.translate(-x, -y);
          }
          PAINT[sp.shape](c, x, y, s * 0.85, col, dir, env, seed);
          c.restore();
        }
      } else {
        PAINT[sp.shape](c, slot.x, fy + 4, s, col, env, item.seed);
      }
      c.globalAlpha = 1;

      // plaque
      c.font = `700 ${Math.round(11 * k)}px "JetBrains Mono", ui-monospace, monospace`;
      c.textAlign = "center";
      c.fillStyle = "rgba(4,20,36,0.55)";
      const label = `${slot.id} ${item.pct}%`;
      const tw = c.measureText(label).width + 12;
      c.beginPath();
      c.roundRect(slot.x - tw / 2, fy + 18 * k, tw, 18 * k, 6);
      c.fill();
      c.fillStyle = item.dead > 0.5 ? "#cbd5e1" : "#e0f7ff";
      c.fillText(label, slot.x, fy + 31 * k);
    }

    // abandoned reef: the cash sits in a chest
    if (this.abandoned > 0.05) {
      c.globalAlpha = this.abandoned;
      const cx = w / 2;
      const cy = fy - 10;
      c.fillStyle = "#7c4a1e";
      c.fillRect(cx - 34 * k, cy - 26 * k, 68 * k, 34 * k);
      c.fillStyle = "#9a5d28";
      c.beginPath();
      c.ellipse(cx, cy - 26 * k, 34 * k, 14 * k, 0, Math.PI, TAU);
      c.fill();
      c.fillStyle = "#facc15";
      c.fillRect(cx - 5 * k, cy - 22 * k, 10 * k, 12 * k);
      c.font = `700 ${Math.round(12 * k)}px "Fredoka", system-ui, sans-serif`;
      c.fillStyle = "#fef3c7";
      c.fillText("CASH", cx, cy + 4 * k);
      c.globalAlpha = 1;
    }

    // bubbles
    c.strokeStyle = "rgba(220,245,255,0.55)";
    c.lineWidth = 1;
    for (const b of this.bubbles) {
      c.beginPath();
      c.arc(b.x + Math.sin(this.t * 3 + b.p) * 3, b.y, b.r, 0, TAU);
      c.stroke();
    }

    // storm surge
    c.strokeStyle = "rgba(200,215,230,0.18)";
    c.lineWidth = 1.2;
    for (const s of this.streaks) {
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x - s.l, s.y + s.l * 0.08);
      c.stroke();
    }

    // fee pollution
    if (this.murk > 0.01) {
      c.fillStyle = `rgba(74,78,34,${this.murk * 0.42})`;
      c.fillRect(-10, -10, w + 20, h + 20);
      c.fillStyle = "rgba(120,104,60,0.5)";
      for (const m of this.motes) {
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, TAU);
        c.fill();
      }
    }

    // floating damage / growth labels
    c.textAlign = "center";
    c.font = `700 ${Math.round(18 * k)}px "Fredoka", system-ui, sans-serif`;
    for (const l of this.labels) {
      c.globalAlpha = clamp(l.life * 1.4, 0, 1);
      c.lineWidth = 4;
      c.strokeStyle = "rgba(2,12,24,0.8)";
      c.strokeText(l.text, l.x, l.y);
      c.fillStyle = l.good ? "#6ee7b7" : "#fda4af";
      c.fillText(l.text, l.x, l.y);
    }
    c.globalAlpha = 1;

    // lightning
    if (this.flash > 0) {
      c.fillStyle = `rgba(230,240,255,${this.flash * 0.45})`;
      c.fillRect(-10, -10, w + 20, h + 20);
      if (this.flash > 0.6) {
        c.strokeStyle = `rgba(255,255,255,${this.flash})`;
        c.lineWidth = 3;
        const bx = ((this.t * 977) % 1) * w;
        c.beginPath();
        c.moveTo(bx, 0);
        let y = 0;
        let x = bx;
        while (y < surf + 30) {
          x += (Math.random() - 0.5) * 30;
          y += 8 + Math.random() * 10;
          c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
  }
}
