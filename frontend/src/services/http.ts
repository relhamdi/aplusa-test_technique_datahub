// Relative by default: dev server and nginx both forward "/api" to the backend.
export const BASE_URL: string = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown; // serialised as the JSON body
  body?: BodyInit; // raw body (FormData for file uploads)
  signal?: AbortSignal;
}

// FastAPI returns { detail: string } or { detail: [{ msg, ... }] } (validation).
function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const joined = detail
        .map((d) => (d as { msg?: string }).msg ?? "")
        .filter(Boolean)
        .join("; ");
      if (joined) return joined;
    }
  }
  return fallback;
}

// Builds the ApiError of a non-2xx response; shared by JSON calls and streams.
export async function toApiError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  return new ApiError(
    response.status,
    messageFrom(payload, response.statusText || `HTTP ${response.status}`),
  );
}

/** Single entry point for JSON calls. */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body = options.body;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await toApiError(response);
  return (await response.json().catch(() => null)) as T;
}
