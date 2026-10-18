import { captureFrom } from "../lib/capture.js";
import { emailBody } from "../lib/emailText.js";

// Capture one open message: its visible body, sender and the thread subject.
export function captureMessage(message) {
  const body = message?.querySelector(".a3s");
  const from = message?.querySelector(".gD[email]");
  const subject = document.querySelector("h2.hP");
  if (!from || !subject || !body) return null;
  const sender = `${from.getAttribute("name") || from.innerText} <${from.getAttribute("email")}>`;
  const title = subject.innerText;
  return captureFrom(body, "email", { title, sender, email_title: title, email_body: emailBody(body) });
}

/** The single visible message in an open thread, or null. */
export function openMessage() {
  if (location.hostname !== "mail.google.com") return null;
  const messages = [...document.querySelectorAll(".adn.ads")].filter(message => {
    const body = message.querySelector(".a3s");
    return body && body.getClientRects().length > 0;
  });
  // TODO(A): verify selectors against a single open message; never enumerate inbox rows.
  return messages.length === 1 ? messages[0] : null;
}

export function detect() {
  const message = openMessage();
  return message ? captureMessage(message) : null;
}
