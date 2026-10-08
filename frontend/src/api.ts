import { normalizeBaseUrl } from "./model";
export async function fetchJson(
  baseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(6000);
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Cannot reach the backend. Check its address, Wi-Fi connection and browser access (CORS).",
    );
  }
  if (!response.ok) {
    if (response.status === 404)
      throw new Error(
        "Not found. Check the backend address and device catalog.",
      );
    throw new Error(
      `The backend returned HTTP ${response.status}. Check the HTTP server and database.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(
      "The backend did not return valid JSON. Check that this is the HTTP API address.",
    );
  }
}
export function readSavedAddress(): string {
  const defaultUrl = `${location.protocol === "https:" ? "https:" : "http:"}//${location.hostname || "localhost"}:3000`;
  try {
    return normalizeBaseUrl(
      localStorage.getItem("legacy-link.api") || defaultUrl,
    );
  } catch {
    return defaultUrl;
  }
}

// Control actions return immediately with an operation ID; poll for device evidence.
export async function controlRequest<T>(
  base: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(base)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
      : AbortSignal.timeout(6000),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error ||
        `Control API returned HTTP ${response.status}. Update the backend and retry.`,
    );
  if (data === null) throw new Error("The control API returned invalid JSON.");
  return data as T;
}
