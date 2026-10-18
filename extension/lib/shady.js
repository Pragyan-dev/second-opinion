// Local "shady email" check for the Verify Authenticity button. Pattern matching only: it runs in
// the page, makes no network requests, and the email is sent nowhere unless the person clicks.
// A smaller cousin of backend/app/fraud/phishing.py; the server check is the full one.

import { bodyLinks } from "./emailText.js";

// [label, weight, pattern]
const PATTERNS = [
  ["Promises guaranteed or risk-free returns", 2,
    /\bguarantee(d)?\b[^.!?\n]{0,40}\b(returns?|profits?|income|gains?)\b|\b(risk[- ]free|no risk|minimal risk|can(not|'t) lose)\b/i],
  ["Promises a reward or prize", 2, /\b(you('ve| have) (won|been selected)|winner|prize|free money|double your)\b/i],
  ["Quotes a high return", 1, /\b\d+(\.\d+)?\s?% (returns?|profits?|gains?)\b|\b(projected|expected) (quarterly |monthly |annual )?returns?\b/i],
  ["Pressure to act fast", 1,
    /\b(urgent(ly)?|immediately|right away|asap|act now|today only|limited time|time[- ]sensitive|last chance|final notice|first[- ]come,? first[- ]served|(within|in) \d+ (minutes?|hours?|days?))\b/i],
  ["Exclusive or private offer", 1, /\b(exclusive|private allocation|limited allocation|pre[- ]ipo|invitation[- ]only|reserved for)\b/i],
  ["Asks for passwords, codes or account details", 3,
    /\b(password|passcode|one[- ]time (code|password)|verification code|social security|ssn|bank account|routing number|card number|cvv|login details)\b/i],
  ["Asks for unusual payment", 2, /\b(wire (transfer|the funds)|bitcoin|crypto(currency)?|usdt|gift cards?|zelle|cash app|western union|(processing|release|transfer) fee)\b/i],
  ["Warns of a problem with your account", 2,
    /\b(suspend(ed)?|locked|deactivat\w*|legal action|penalt(y|ies)|(unauthori[sz]ed|unusual|suspicious) (access|activity|sign[- ]in|login)|compromised)\b/i],
  ["Asks for secrecy or a private channel", 1, /\b(keep (this|it) (private|secret|confidential)|strictly confidential|whatsapp|telegram|wechat)\b/i],
  ["Generic greeting", 1, /^\s*(dear|hello|hi)\s+(customer|user|client|member|sir|madam|account holder|valued \w+|investor)\b/im],
];
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com"]);
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rb.gy"]);
const BUSINESS = /\b(capital|bank|advisors?|wealth|securities|investments?|financial|support|billing|security)\b/i;
// The sum of weights that marks an email as shady.
export const SHADY_AT = 2;

function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
// Last two labels. Close enough for comparing a sender with its links on this side.
const site = host => host.split(".").slice(-2).join(".");

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * @param {{ title?: string, body?: string, sender?: string|null, links?: string[] }} email
 * @returns {{ shady: boolean, score: number, reasons: string[] }}
 */
export function assess({ title = "", body = "", sender = "", links = [] }) {
  const text = `${title}\n${body}`;
  const found = PATTERNS.filter(([, , pattern]) => pattern.test(text)).map(([label, weight]) => [label, weight]);

  const address = (sender || "").match(/<([^>]+)>/)?.[1] || (sender || "").trim();
  const senderSite = address.includes("@") ? site(address.split("@").pop().toLowerCase()) : "";
  const linkSites = [...new Set([...links, ...bodyLinks(body)].map(hostOf).filter(Boolean).map(site))];
  if (senderSite && FREE_MAIL.has(senderSite) && BUSINESS.test(`${sender} ${body}`)) {
    found.push(["Business email from a free address", 2]);
  } else if (senderSite) {
    const others = linkSites.filter(s => s !== senderSite);
    if (others.some(s => distance(s, senderSite) <= 2)) found.push(["Link uses a look-alike of the sender's domain", 3]);
    else if (others.length) found.push(["Link goes to a different domain than the sender", 1]);
  }
  if (linkSites.some(s => SHORTENERS.has(s) || /^\d+\.\d+$/.test(s) || s.includes("xn--"))) {
    found.push(["Unusual link address", 2]);
  }
  const score = found.reduce((sum, [, weight]) => sum + weight, 0);
  return { shady: score >= SHADY_AT, score, reasons: found.sort((a, b) => b[1] - a[1]).map(([label]) => label) };
}
