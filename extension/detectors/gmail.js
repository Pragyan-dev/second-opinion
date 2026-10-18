import { captureFrom } from "../lib/capture.js";

// Capture one open message: its visible body, sender and the thread subject.
export function captureMessage(message) {
  const body = message?.querySelector(".a3s");
  const from = message?.querySelector(".gD[email]");
  const subject = document.querySelector("h2.hP");
  if (!from || !subject || !body) return null;
  const sender = `${from.getAttribute("name") || from.innerText} <${from.getAttribute("email")}>`;
  return captureFrom(body, "email", { title: subject.innerText, sender });
}

export function detect() {
  if (location.hostname !== "mail.google.com") return null;
  const messages = [...document.querySelectorAll(".adn.ads")].filter(message => {
    const body = message.querySelector(".a3s");
    return body && body.getClientRects().length > 0;
  });
  if (messages.length !== 1) return null;
  // TODO(A): verify selectors against a single open message; never enumerate inbox rows.
  return captureMessage(messages[0]);
}
