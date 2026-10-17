import { captureFrom } from "../lib/capture.js";

export function detect() {
  // Never fall back to collecting a mailbox, social feed, or unrelated stock page.
  if (["mail.google.com", "x.com", "robinhood.com"].includes(location.hostname)) return null;
  return document.body ? captureFrom(document.body, "website") : null;
}
