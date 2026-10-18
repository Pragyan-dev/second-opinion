"use client";
import { useEffect, useState } from "react";
import { accessibleLabel } from "@/lib/accessibility";

export function usePageTools(tooltips: boolean, guide: boolean) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [guideY, setGuideY] = useState<number | null>(null);

  useEffect(() => {
    if (!guide) { setGuideY(null); return; }
    const move = (event: PointerEvent) => setGuideY(event.pointerType === "touch" || (event.target as Element).closest?.("[data-accessibility-ui]") ? null : event.clientY);
    const leave = () => setGuideY(null);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [guide]);

  useEffect(() => {
    if (!tooltips) { setTooltip(null); return; }
    let target: Element | null = null;
    let previousDescription: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const clear = () => {
      if (target) {
        if (previousDescription === null) target.removeAttribute("aria-describedby");
        else target.setAttribute("aria-describedby", previousDescription);
      }
      target = null;
      setTooltip(null);
    };
    const show = (event: Event) => {
      clearTimeout(timer);
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("#accessibility-tooltip")) return;
      const control = element?.closest("a, button, input, select, textarea, [title], [aria-label], img");
      if (!control || control.closest("[data-accessibility-ui]")) { clear(); return; }
      if (control === target) return;
      clear();
      const text = accessibleLabel(control) || (control.id && document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(control.id)}"]`)?.textContent);
      if (!text) return;
      target = control;
      previousDescription = control.getAttribute("aria-describedby");
      control.setAttribute("aria-describedby", [previousDescription, "accessibility-tooltip"].filter(Boolean).join(" "));
      const rect = control.getBoundingClientRect();
      setTooltip({ text, x: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 112)) });
    };
    const hide = () => { timer = setTimeout(clear, 200); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", clear, true);
    return () => {
      clearTimeout(timer); clear();
      document.removeEventListener("mouseover", show); document.removeEventListener("focusin", show);
      document.removeEventListener("mouseout", hide); document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", escape); window.removeEventListener("scroll", clear, true);
    };
  }, [tooltips]);

  return { tooltip, guideY };
}
