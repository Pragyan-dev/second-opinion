"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export function useJob<T extends { status: string }>(path: string, symbol?: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setData(undefined); setError("");
    async function start() {
      try {
        let route = path;
        if (symbol) {
          const job = await api<{ xray_id: string }>("/v1/xray", { symbol }, controller.signal);
          route = `/v1/xray/${encodeURIComponent(job.xray_id)}`;
        }
        async function poll() {
          try {
            const value = await api<T>(route, undefined, controller.signal);
            if (controller.signal.aborted) return;
            setData(value);
            if (!["done", "error"].includes(value.status)) timer = setTimeout(poll, 1000);
          } catch (err) { if (!controller.signal.aborted) setError(String(err)); }
        }
        await poll();
      } catch (err) { if (!controller.signal.aborted) setError(String(err)); }
    }
    start();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path, symbol]);
  return { data, error };
}
