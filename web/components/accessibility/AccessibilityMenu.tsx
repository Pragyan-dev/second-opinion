"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ACCESSIBILITY_STORAGE_KEY, DEFAULT_PREFERENCES, LEVELS, accessibleLabel, applyPreferences,
  focusPageElement, nextPreference, parsePreferences, parseVoiceCommand, preferenceLabel, speechChunks,
  type AccessibilityPreferences, type Preference,
} from "@/lib/accessibility";
import { AccessibilityIcon as Icon } from "./AccessibilityIcon";
import { usePageTools } from "./usePageTools";
import styles from "./accessibility.module.css";

const FEATURES: { key: Preference | "reader" | "voice" | "structure"; label: string; hint: string; icon?: string }[] = [
  { key: "reader", label: "Screen Reader", hint: "Read the page or selected text aloud using your browser. Your device’s screen reader remains available." },
  { key: "voice", label: "Voice Navigation", hint: "Navigate by speaking. Your browser will request microphone access and may send audio to its speech service." },
  { key: "contrast", label: "Contrast +", hint: "Cycle through dark, light and inverted colors." },
  { key: "smartContrast", label: "Smart Contrast", hint: "Increase text and surface contrast while keeping distinct status colors." },
  { key: "highlightLinks", label: "Highlight Links", hint: "Underline and outline links so they stand out." },
  { key: "textSize", label: "Bigger Text", hint: "Increase text size up to 200%. Activate again to cycle back." },
  { key: "textSpacing", label: "Text Spacing", hint: "Increase the space between letters and words." },
  { key: "pauseAnimations", label: "Pause Animations", hint: "Stop decorative animations and transitions. Live report data continues to update." },
  { key: "hideImages", label: "Hide Images", hint: "Hide photos and decorative images. Chart data and text alternatives remain available." },
  { key: "dyslexia", label: "Dyslexia Friendly", hint: "Use a simple sans-serif font, regular letter shapes and wider spacing." },
  { key: "cursor", label: "Cursor", hint: "Cycle between a large pointer, a reading guide and the default cursor." },
  { key: "tooltips", label: "Tooltips", hint: "Show readable labels when you hover over or focus links and controls." },
  { key: "structure", label: "Page Structure", hint: "List the page’s headings and jump to a section." },
  { key: "lineHeight", label: "Line Height", hint: "Increase the space between lines of text." },
  { key: "textAlign", label: "Text Align", hint: "Cycle between left, center and right alignment." },
];

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; abort: () => void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type Heading = { element: HTMLElement; label: string; level: number };

export function AccessibilityMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<AccessibilityPreferences>({ ...DEFAULT_PREFERENCES });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Choose an adjustment. Your preferences are saved on this browser.");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [reading, setReading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voice, setVoice] = useState(false);
  const [voiceHelp, setVoiceHelp] = useState(false);
  const [structure, setStructure] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const speechRun = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const { tooltip, guideY } = usePageTools(prefs.tooltips, prefs.cursor === 2);

  const stopReading = useCallback(() => {
    speechRun.current++;
    if (utterance.current) window.speechSynthesis?.cancel();
    utterance.current = null;
    setReading(false); setPaused(false);
  }, []);
  const stopVoice = useCallback(() => {
    const active = recognition.current;
    recognition.current = null;
    active?.abort();
    setVoice(false);
  }, []);
  const closeMenu = useCallback(() => { dialog.current?.close(); setOpen(false); }, []);

  useEffect(() => {
    try { setPrefs(parsePreferences(localStorage.getItem(ACCESSIBILITY_STORAGE_KEY))); }
    catch { /* Settings still work in memory when storage is blocked. */ }
    setReady(true);
    setSpeechSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    const browser = window as SpeechWindow;
    setVoiceSupported(!!(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    return () => { stopReading(); stopVoice(); };
  }, [stopReading, stopVoice]);

  useEffect(() => {
    if (!ready) return;
    applyPreferences(document.documentElement, prefs);
    try { localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(prefs)); }
    catch { setMessage("Preferences apply now, but this browser cannot save them after closing."); }
  }, [prefs, ready]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        if (!event.repeat) setOpen(value => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => { closeMenu(); stopReading(); stopVoice(); }, [path, closeMenu, stopReading, stopVoice]);

  useEffect(() => {
    if (!structure || !open) return;
    const main = document.getElementById("main");
    if (!main) return;
    const update = () => setHeadings(Array.from(main.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).filter(el =>
      !el.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(el).display !== "none"
    ).map(element => ({ element, label: element.textContent?.trim() || "Untitled section", level: Number(element.tagName[1]) })));
    update();
    const observer = new MutationObserver(update);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [structure, open, path]);

  function changePreference(key: Preference, label: string) {
    const next = nextPreference(prefs, key);
    setPrefs(next);
    setMessage(`${label}: ${preferenceLabel(next, key)}.`);
  }

  function startReading() {
    if (reading) { stopReading(); setMessage("Reading stopped."); return; }
    if (!speechSupported) { setMessage("Read aloud is unavailable in this browser. You can use your device’s screen reader."); return; }
    stopVoice();
    const main = document.getElementById("main");
    const selection = window.getSelection();
    const selected = selection?.anchorNode && main?.contains(selection.anchorNode) ? selection.toString().trim() : "";
    let pageText = "";
    if (main && !selected) {
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null;
        const graphic = element?.matches('[role="img"], img[alt]');
        if (element && !graphic) continue;
        const parent = element || node.parentElement;
        if (!parent || parent.closest('script,style,[hidden],[aria-hidden="true"],.sr-only') || (!graphic && parent.closest("svg"))) continue;
        let visible = true;
        for (let el: Element | null = parent; el && el !== main; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") { visible = false; break; }
        }
        const text = graphic ? accessibleLabel(parent) : node.textContent?.trim();
        if (visible && text) pageText += `${text} `;
      }
    }
    const chunks = speechChunks(selected || pageText);
    if (!chunks.length) { setMessage("There is no page text to read yet."); return; }
    stopReading();
    const run = speechRun.current;
    setReading(true); setMessage(selected ? "Reading selected text aloud." : "Reading the page aloud.");
    const speak = (index: number) => {
      if (run !== speechRun.current) return;
      if (index >= chunks.length) { utterance.current = null; setReading(false); setPaused(false); setMessage("Reading finished."); return; }
      const next = new SpeechSynthesisUtterance(chunks[index]);
      utterance.current = next;
      next.lang = document.documentElement.lang || "en";
      next.onend = () => speak(index + 1);
      next.onerror = () => { if (run === speechRun.current) { stopReading(); setMessage("The browser could not read this text. Check your device’s speech voice settings."); } };
      window.speechSynthesis.speak(next);
    };
    speak(0);
  }

  function runVoiceCommand(transcript: string) {
    const command = parseVoiceCommand(transcript);
    if (!command) { setMessage(`“${transcript}” is not a command. Try “scroll down” or “next heading”.`); return; }
    if (command === "stop") { stopVoice(); setMessage("Voice navigation stopped."); return; }
    if (command === "openMenu") { setOpen(true); return; }
    if (command === "closeMenu") { closeMenu(); return; }
    closeMenu();
    requestAnimationFrame(() => {
      const amount = Math.round(window.innerHeight * .7);
      if (command === "down" || command === "up") window.scrollBy({ top: command === "down" ? amount : -amount, behavior: "instant" });
      else if (command === "top" || command === "bottom") window.scrollTo({ top: command === "top" ? 0 : document.documentElement.scrollHeight, behavior: "instant" });
      else if (command === "activateLink") {
        const active = document.activeElement;
        if (active instanceof HTMLAnchorElement && active.closest("#dashboard-content")) active.click();
        else { setMessage("Say “next link” to focus a link before opening it."); return; }
      } else {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>(command === "nextHeading" ? "#main :is(h1,h2,h3,h4,h5,h6)" : "#dashboard-content a[href]"))
          .filter(element => element.getClientRects().length && !element.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(element).visibility !== "hidden");
        if (!candidates.length) { setMessage("There are no matching items on this page yet."); return; }
        const index = candidates.indexOf(document.activeElement as HTMLElement);
        const direction = command === "previousLink" ? -1 : 1;
        const next = candidates[(index < 0 ? (direction > 0 ? 0 : candidates.length - 1) : index + direction + candidates.length) % candidates.length];
        focusPageElement(next);
        setMessage(`Focused: ${accessibleLabel(next)}.`); return;
      }
      setMessage(`Voice command: ${transcript}.`);
    });
  }

  function startVoice() {
    if (recognition.current) { stopVoice(); setMessage("Voice navigation stopped."); return; }
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setMessage("Voice navigation is unavailable in this browser. Keyboard navigation is always available."); return; }
    stopReading();
    const active = new Constructor();
    active.continuous = true; active.interimResults = false; active.lang = "en-US";
    recognition.current = active;
    active.onstart = () => { if (recognition.current === active) { setVoice(true); setMessage("Listening. Say “next heading”, “scroll down” or “stop listening”."); closeMenu(); } };
    active.onresult = event => {
      if (recognition.current !== active) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) runVoiceCommand(event.results[i][0].transcript);
      }
    };
    active.onerror = event => {
      if (recognition.current !== active) return;
      const reason = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone access was denied. Allow it in your browser’s site settings to use voice navigation."
        : event.error === "no-speech" ? "No speech detected. Start voice navigation again when you are ready."
        : `Voice navigation stopped (${event.error}). Check your microphone and connection, then try again.`;
      stopVoice(); setMessage(reason); setOpen(true);
    };
    active.onend = () => { if (recognition.current === active) { recognition.current = null; setVoice(false); setMessage("Voice session ended. Open the menu to start listening again."); } };
    try { active.start(); setMessage("Waiting for microphone access…"); }
    catch { stopVoice(); setMessage("The microphone could not start. Check your browser’s microphone settings."); }
  }

  function activate(key: typeof FEATURES[number]["key"], label: string) {
    if (key === "reader") startReading();
    else if (key === "voice") {
      setVoiceHelp(!voiceHelp);
      if (!voiceHelp) requestAnimationFrame(() => document.getElementById("accessibility-voice")?.scrollIntoView({ block: "nearest" }));
    }
    else if (key === "structure") {
      setStructure(!structure);
      if (!structure) requestAnimationFrame(() => document.getElementById("accessibility-outline")?.scrollIntoView({ block: "nearest" }));
    }
    else changePreference(key, label);
  }
  const activeCount = Object.values(prefs).filter(Boolean).length;

  return (
    <div data-accessibility-ui className={styles.root}>
      <button ref={launcher} type="button" className={styles.launcher} aria-label="Open accessibility menu" aria-haspopup="dialog" aria-expanded={open} aria-controls="accessibility-menu" aria-keyshortcuts="Control+U Meta+U" onClick={() => setOpen(true)}>
        <Icon name="accessibility" size={29} /><span>Accessibility</span>{activeCount > 0 && <span className={styles.count}>{activeCount}</span>}
      </button>
      <dialog ref={dialog} id="accessibility-menu" className={`${styles.panel} ${prefs.oversized ? styles.oversized : ""}`} aria-labelledby="accessibility-title" onCancel={closeMenu} onClose={() => setOpen(false)} onClick={event => {
        if (event.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMenu();
        }
      }}>
        <header className={styles.header}>
          <div><h2 id="accessibility-title">Accessibility Menu</h2><span>Make yourself comfortable.</span></div>
          <button type="button" className={styles.close} onClick={closeMenu} aria-label="Close accessibility menu" autoFocus><Icon name="close" size={25} /></button>
        </header>
        <div className={styles.scroll}>
          <div className={styles.toolbar}><span className={styles.shortcut}>Ctrl + U <span aria-hidden="true">/</span> ⌘ + U</span>
            <button type="button" className={styles.sizeSwitch} role="switch" aria-checked={prefs.oversized} onClick={() => changePreference("oversized", "Oversized widget")}><span>XL</span> Oversized widget <i aria-hidden="true" /></button>
          </div>
          <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{message}</p>
          {reading && <div className={styles.inlineAudio}>
            <button type="button" className={styles.action} onClick={() => { if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause(); setPaused(!paused); }}>{paused ? "Resume reading" : "Pause reading"}</button>
            <button type="button" className={styles.reset} onClick={stopReading}>Stop reading</button>
          </div>}
          <div className={styles.grid}>
            {FEATURES.map(feature => {
              const key = feature.key;
              const active = key === "reader" ? reading : key === "voice" ? voiceHelp || voice : key === "structure" ? structure : !!prefs[key];
              const unavailable = key === "reader" ? !speechSupported : key === "voice" ? !voiceSupported : false;
              const value = key === "reader" ? (reading ? "Reading · stop" : "Read aloud") : key === "voice" ? (voice ? "Listening" : "Commands") : key === "structure" ? (structure ? "Close outline" : "View headings") : preferenceLabel(prefs, key);
              const levelCount = key in LEVELS ? LEVELS[key as Preference]!.length - 1 : 0;
              return <button key={key} type="button" className={styles.tile} aria-pressed={key === "structure" || key === "voice" ? undefined : active} aria-expanded={key === "structure" ? structure : key === "voice" ? voiceHelp : undefined} aria-controls={key === "structure" ? "accessibility-outline" : key === "voice" ? "accessibility-voice" : undefined} aria-describedby={`accessibility-hint-${key}`} data-active={active} onClick={() => activate(key, feature.label)}>
                <Icon name={feature.icon || key} /><span className={styles.label}>{feature.label}</span>
                <span className={styles.value}>{unavailable ? "Unavailable here" : value}</span>
                <span id={`accessibility-hint-${key}`} className="sr-only">{feature.hint}</span>
                {levelCount > 0 && <span className={styles.levels} aria-hidden="true">{Array.from({ length: levelCount }, (_, i) => <i key={i} data-filled={i < (prefs[key as Preference] as number)} />)}</span>}
              </button>;
            })}
          </div>
          {voiceHelp && <section id="accessibility-voice" className={styles.details} aria-labelledby="voice-title">
            <h3 id="voice-title">Voice navigation</h3>
            <p>Say “scroll down”, “scroll up”, “go to top”, “go to bottom”, “next link”, “previous link”, “open link”, “next heading”, “open menu”, “close menu” or “stop listening”.</p>
            <p>Starting requests microphone access. Your browser may process audio through its speech service. Listening stops when you leave this page.</p>
            {voiceSupported ? <button type="button" className={styles.action} onClick={startVoice}>{voice ? "Stop listening" : "Start listening"}</button> : <p role="status">Speech recognition is unavailable in this browser. Use Tab to move between links and controls.</p>}
          </section>}
          {structure && <section id="accessibility-outline" className={styles.details} aria-labelledby="outline-title">
            <h3 id="outline-title">Page structure</h3>
            <nav aria-label="Page headings"><ol>{headings.map((heading, index) => <li key={index}><button type="button" onClick={() => { closeMenu(); requestAnimationFrame(() => focusPageElement(heading.element)); }}><span>H{heading.level}</span>{heading.label}</button></li>)}</ol></nav>
            {!headings.length && <p>No headings are available yet.</p>}
          </section>}
          <p className={styles.note}>Changes apply to this dashboard. Use your device’s screen reader for full assistive navigation.</p>
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.reset} onClick={() => { stopReading(); stopVoice(); setPrefs({ ...DEFAULT_PREFERENCES }); setVoiceHelp(false); setStructure(false); setMessage("All accessibility settings reset."); }}><Icon name="reset" size={19} />Reset all settings</button>
          <span>Second Opinion</span>
        </footer>
      </dialog>
      {(reading || voice) && <div className={styles.playback} role="region" aria-label="Accessibility audio controls">
        <span>{voice ? "Microphone on" : paused ? "Reading paused" : "Reading aloud"}</span>
        {reading && <button type="button" onClick={() => { if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause(); setPaused(!paused); }}>{paused ? "Resume" : "Pause"}</button>}
        <button type="button" onClick={() => { stopReading(); stopVoice(); setMessage("Audio stopped."); }}>Stop</button>
        <button type="button" onClick={() => setOpen(true)}>Menu</button>
      </div>}
      {!open && <span className="sr-only" role="status">{message}</span>}
      {tooltip && <div id="accessibility-tooltip" className={styles.tooltip} role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
      {guideY !== null && <div className={styles.guide} style={{ top: guideY }} aria-hidden="true" />}
    </div>
  );
}
