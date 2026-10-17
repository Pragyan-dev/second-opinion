"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export function useJob<T extends { status: string }>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setData(undefined); setError("");
    async function poll() {
      try {
        const value = await api<T>(path, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setData(value);
        if (!["done", "error"].includes(value.status)) timer = setTimeout(poll, 1000);
      } catch (err) { if (!controller.signal.aborted) setError(String(err)); }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path]);
  return { data, error };
}
