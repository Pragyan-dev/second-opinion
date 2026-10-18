// Email body as plain text, with each web link written as "text <url>" so the reader of the text
// (the API, or the local shady check) can see where every link really goes.

const BLOCKS = "p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table";

/** Gmail sometimes points links at google.com/url?q=<real>. Use the real destination. */
export function realHref(href) {
  try {
    const url = new URL(href);
    if (/(^|\.)google\.com$/.test(url.hostname) && url.pathname === "/url" && url.searchParams.get("q")) {
      return url.searchParams.get("q");
    }
    return url.href;
  } catch { return href; }
}

/** @param {Element} root a message body element; it is cloned, never changed. */
export function emailBody(root) {
  if (!root) return "";
  const copy = root.cloneNode(true);
  copy.querySelectorAll("script, style, head, title").forEach(node => node.remove());
  for (const anchor of copy.querySelectorAll("a[href]")) {
    const href = realHref(anchor.getAttribute("href").trim());
    if (/^https?:\/\//i.test(href) && anchor.textContent.trim() !== href) anchor.append(` <${href}>`);
  }
  copy.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
  copy.querySelectorAll(BLOCKS).forEach(node => node.append("\n"));
  return copy.textContent.replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}

/** Web links in a body, from the "<url>" marks and bare URLs alike, in order. */
export function bodyLinks(body) {
  return [...new Set([...body.matchAll(/https?:\/\/[^\s<>"'`]+/gi)].map(m => m[0].replace(/[.,;:!?)\]]+$/, "")))];
}
