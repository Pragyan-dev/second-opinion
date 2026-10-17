import { captureFrom } from "../lib/capture.js";

export function detect() {
  if (location.hostname !== "x.com" || !/^\/[^/]+\/status\/\d+\/?$/.test(location.pathname)) return null;
  const path = location.pathname.replace(/\/$/, "");
  const post = [...document.querySelectorAll('article[data-testid="tweet"]')].find(article =>
    [...article.querySelectorAll('a[href]')].some(a => new URL(a.href).pathname.replace(/\/$/, "") === path));
  const body = post?.querySelector('[data-testid="tweetText"]');
  const sender = post?.querySelector('[data-testid="User-Name"]')?.innerText.match(/@[A-Za-z0-9_]+/)?.[0];
  if (!body || !sender) return null;
  // TODO(A): retain only the selected post if the site changes its DOM structure.
  return captureFrom(body, "social_post", { title: `${sender} post`, sender });
}
