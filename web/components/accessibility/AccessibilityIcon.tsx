import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  accessibility: <><circle cx="16" cy="5" r="2.5" /><path d="M5 11l11 2 11-2M16 13v7m0 0l-6 9m6-9l6 9" /></>,
  reader: <path d="M3 16h3m3-6v12m5-17v22m5-18v14m5-12v10m3-5h3" />,
  voice: <><rect x="12" y="3" width="8" height="17" rx="4" /><path d="M7 14v2a9 9 0 0018 0v-2M16 25v4m-5 0h10" /></>,
  contrast: <><circle cx="16" cy="16" r="12" /><path d="M16 4a12 12 0 010 24z" fill="currentColor" stroke="none" /></>,
  smartContrast: <><circle cx="13" cy="14" r="10" /><path d="M13 4a10 10 0 000 20z" fill="currentColor" /><path d="M24 17v3m0 8v3m-7-7h3m8 0h3m-12-5 2 2m5 5 2 2m-9 0 2-2m5-5 2-2" /><circle cx="24" cy="24" r="4" fill="white" /></>,
  highlightLinks: <><path d="M12 10H9a6 6 0 000 12h3m8-12h3a6 6 0 010 12h-3M10 16h12" /></>,
  textSize: <><path d="M3 11h10M8 11v15M18 5h12M24 5v21" /></>,
  textSpacing: <path d="M3 16h26M7 11l-5 5 5 5m18-10 5 5-5 5M12 9v14m8-14v14" />,
  pauseAnimations: <><circle cx="16" cy="16" r="13" strokeDasharray="1 4" /><path d="M12 11v10m8-10v10" strokeWidth="3" /></>,
  hideImages: <><path d="M28 17v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h11M4 23l8-9 12 14M23 3l7 7m0-7-7 7" /><circle cx="12" cy="9" r="1" /></>,
  dyslexia: <><path d="M5 5v22h6a11 11 0 000-22H5m17 22V11c0-5 4-6 7-4M19 15h10" /></>,
  cursor: <path d="M6 3l6 26 5-10 11-4L6 3z" />,
  tooltips: <><path d="M6 4h20a2 2 0 012 2v15a2 2 0 01-2 2H15l-9 6V6a2 2 0 012-2zM17 13v5" /><circle cx="17" cy="9" r=".7" fill="currentColor" /></>,
  structure: <><path d="M16 3L3 10l13 7 13-7-13-7zM3 17l13 7 13-7M3 24l13 7 13-7" /></>,
  lineHeight: <path d="M12 5h18M12 12h18M12 19h18M12 26h18M4 5v21M1 8l3-3 3 3M1 23l3 3 3-3" />,
  textAlign: <path d="M3 5h26M3 12h18M3 19h26M3 26h18" />,
  close: <path d="M8 8l16 16M24 8L8 24" />,
  reset: <><path d="M6 11a11 11 0 111 13M6 3v8h8" /></>,
};

export function AccessibilityIcon({ name, size = 32 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.accessibility}</svg>;
}
