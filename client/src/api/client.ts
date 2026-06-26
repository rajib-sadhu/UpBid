import type { ApiError } from "shared";
import { getToken } from "../lib/auth-storage.js";

const BASE = import.meta.env.VITE_API_URL ?? "";

/** Error thrown by apiFetch carrying the server's stable error code + status. */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  // For multipart uploads let the browser set Content-Type (with the boundary).
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiClientError(
      err.code ?? "INTERNAL",
      err.message ?? res.statusText,
      res.status,
      err.details,
    );
  }
  return data as T;
}
