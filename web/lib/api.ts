// Default is the same-origin proxy configured in next.config.mjs (BACKEND_URL, default http://127.0.0.1:8000).
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/backend";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// FastAPI errors are {"detail": string | [{msg}]}.
function detailOf(text: string): string {
  try {
    const body = JSON.parse(text);
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map(d => d?.msg ?? String(d)).join("; ");
  } catch { /* not JSON */ }
  return text || "Request failed";
}

// Single fetch wrapper for every page. Owner C.
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "Network error");
  }
  if (!response.ok) throw new ApiError(response.status, detailOf(await response.text()));
  return response.json() as Promise<T>;
}

export const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
