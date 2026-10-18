import { captureFrom } from "../lib/capture.js";
import { emailBody } from "../lib/emailText.js";

// Mailpit, the local test inbox (http://localhost:8025). One open message at /view/:id is read
// from Mailpit's own API on the same origin; the message list is never read.
export const MAILPIT_HOSTS = ["localhost:8025", "127.0.0.1:8025"];

export const onMailpit = loc => MAILPIT_HOSTS.includes(loc.host);

export function messageId(loc = location) {
  const match = loc.pathname.match(/\/view\/([^/]+)\/?$/);
  return onMailpit(loc) && match ? decodeURIComponent(match[1]) : null;
}

// Mailpit may run under a --webroot, so the API path is relative to the view path.
function messageApi(id, loc) {
  const root = loc.pathname.slice(0, loc.pathname.lastIndexOf("/view/") + 1);
  return `${root}api/v1/message/${encodeURIComponent(id)}`;
}

const address = person => person.Name ? `${person.Name} <${person.Address}>` : person.Address;

/** Shape a Mailpit message (GET /api/v1/message/:id) as a Capture. */
export function captureMessage(message, loc = location, doc = document) {
  // A parsed document is inert: no scripts run and no images load.
  const html = message.HTML ? new DOMParser().parseFromString(message.HTML, "text/html") : null;
  const title = message.Subject || "(no subject)";
  const body = html?.body ? emailBody(html.body) : (message.Text || "").trim().slice(0, 20000);
  // Links, mailto: and tel: come from the HTML anchors; tickers from the body text.
  const anchors = html?.body ? captureFrom(html.body, "email") : { links: [], emails: [], phones: [] };
  const container = doc.createElement("div");
  container.textContent = body;
  return captureFrom(container, "email", {
    url: loc.href, title, text: body, email_title: title, email_body: body,
    sender: message.From?.Address ? address(message.From) : null,
    links: anchors.links, emails: anchors.emails, phones: anchors.phones,
  });
}

export async function detect() {
  const id = messageId();
  if (!id) return null;
  const response = await fetch(messageApi(id, location));
  if (!response.ok) throw new Error(`Mailpit ${response.status}`);
  return captureMessage(await response.json());
}
