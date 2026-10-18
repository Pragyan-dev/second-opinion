"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

const POLL_MS = 1000;
const STALL_MS = 90_000;

export function useJob<T extends { status: string }>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [stalled, setStalled] = useState(false);
  const [isPolling, setPolling] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    startedAt.current = Date.now();
    setError(undefined); setStalled(false); setPolling(true);

    async function poll() {
      timer = undefined;
      if (document.hidden) return; // resumed by the visibilitychange handler
      try {
        const value = await api<T>(path, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setData(value);
        if (["done", "error"].includes(value.status)) { finished = true; setPolling(false); return; }
        if (Date.now() - startedAt.current > STALL_MS) { setStalled(true); setPolling(false); return; }
        timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (controller.signal.aborted) return;
        finished = true; setPolling(false);
        setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
      }
    }
    const onVisible = () => { if (!document.hidden && !finished && !timer) poll(); };
    document.addEventListener("visibilitychange", onVisible);
    poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [path, epoch]);

  // Restart polling ("Keep waiting") or reload after an error.
  const retry = useCallback(() => setEpoch(n => n + 1), []);
  return { data, error, stalled, isPolling, retry };
}
