"use client";
import { createContext, useContext } from "react";
import type { SiteVisit } from "./contracts";
import { hostname } from "./format";

// Hostnames the agent visited for this report. Anything on them is shown as text, never linked.
export const CheckedSiteContext = createContext<ReadonlySet<string>>(new Set());

export function checkedHosts(visit?: SiteVisit | null): ReadonlySet<string> {
  if (!visit) return new Set();
  return new Set([visit.start_url, visit.final_url, ...(visit.pages_visited ?? [])].map(hostname).filter(Boolean));
}

export function useIsCheckedSite(url?: string | null): boolean {
  const hosts = useContext(CheckedSiteContext);
  return !!url && hosts.has(hostname(url));
}
