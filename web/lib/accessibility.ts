export const ACCESSIBILITY_STORAGE_KEY = "second-opinion.accessibility.v1";

export const DEFAULT_PREFERENCES = {
  contrast: 0, smartContrast: false, highlightLinks: false, textSize: 0,
  textSpacing: 0, pauseAnimations: false, hideImages: false, dyslexia: false,
  cursor: 0, tooltips: false, lineHeight: 0, textAlign: 0, oversized: false,
};
export type AccessibilityPreferences = typeof DEFAULT_PREFERENCES;
export type Preference = keyof AccessibilityPreferences;

export const LEVELS: Partial<Record<Preference, readonly string[]>> = {
  contrast: ["Off", "Dark", "Light", "Inverted"],
  textSize: ["Default", "125%", "150%", "175%", "200%"],
  textSpacing: ["Default", "Light", "Medium", "Wide"],
  cursor: ["Default", "Large cursor", "Reading guide"],
  lineHeight: ["Default", "1.75×", "2×", "2.5×"],
  textAlign: ["Default", "Left", "Center", "Right"],
};

// Only known, correctly typed values survive an old or damaged saved preference.
// Speech and microphone state are deliberately never persisted.
export function parsePreferences(raw: string | null): AccessibilityPreferences {
  const result = { ...DEFAULT_PREFERENCES };
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return result;
    for (const key of Object.keys(result) as Preference[]) {
      const value = saved[key];
      if (typeof result[key] === "boolean" && typeof value === "boolean") {
        Object.assign(result, { [key]: value });
      } else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < (LEVELS[key]?.length || 0)) {
        Object.assign(result, { [key]: value });
      }
    }
    // These are alternative color treatments, never stacked filters.
    if (result.contrast) result.smartContrast = false;
  } catch { /* Private browsing / malformed storage keeps the defaults. */ }
  return result;
}

export function nextPreference(prefs: AccessibilityPreferences, key: Preference): AccessibilityPreferences {
  const next = { ...prefs };
  const values = LEVELS[key];
  Object.assign(next, { [key]: values ? ((prefs[key] as number) + 1) % values.length : !prefs[key] });
  if (key === "contrast") next.smartContrast = false;
  if (key === "smartContrast") next.contrast = 0;
  return next;
}

export function preferenceLabel(prefs: AccessibilityPreferences, key: Preference) {
  return LEVELS[key]?.[prefs[key] as number] || (prefs[key] ? "On" : "Off");
}

export function applyPreferences(root: HTMLElement, prefs: AccessibilityPreferences) {
  for (const key of Object.keys(prefs) as Preference[]) {
    root.setAttribute(`data-a11y-${key.toLowerCase()}`, String(prefs[key]));
  }
  root.style.setProperty("--a11y-text-scale", String(1 + prefs.textSize * .25));
}

export function speechChunks(text: string, limit = 220): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const chunks: string[] = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && chunk.length + word.length + 1 > limit) { chunks.push(chunk); chunk = ""; }
    chunk += (chunk ? " " : "") + word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export type VoiceCommand = "down" | "up" | "top" | "bottom" | "nextLink" | "previousLink" | "nextHeading" | "openMenu" | "closeMenu" | "stop" | "activateLink" | null;
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const phrase = transcript.toLowerCase().replace(/[.!?,]/g, "").trim();
  const commands: Record<string, VoiceCommand> = {
    "scroll down": "down", "scroll up": "up", "go to top": "top", "go to bottom": "bottom",
    "next link": "nextLink", "previous link": "previousLink", "next heading": "nextHeading",
    "open menu": "openMenu", "open accessibility": "openMenu", "close menu": "closeMenu",
    "stop listening": "stop", "open link": "activateLink",
  };
  return commands[phrase] || null;
}

export function accessibleLabel(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelledText = labelledBy?.split(/\s+/).map(id => element.ownerDocument.getElementById(id)?.textContent || "").join(" ").trim();
  return (labelledText || element.getAttribute("aria-label") || element.getAttribute("title") ||
    element.getAttribute("alt") || element.textContent || "").replace(/\s+/g, " ").trim();
}

export function focusPageElement(element: HTMLElement) {
  const previous = element.getAttribute("tabindex");
  if (previous === null) {
    element.setAttribute("tabindex", "-1");
    element.addEventListener("blur", () => element.removeAttribute("tabindex"), { once: true });
  }
  element.focus({ preventScroll: true });
  element.scrollIntoView({ behavior: "instant", block: "center" });
}
