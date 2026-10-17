const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Single fetch wrapper for every page. Owner C.
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export interface BankSummary {
  customer: { id: string; first_name: string; last_name: string };
  reference_date: string;
  accounts: { id: string; nickname: string; type: string; balance: number }[];
  transactions: { id: string; account_id: string; date: string; description: string; amount: number; type: string }[];
}

export const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
