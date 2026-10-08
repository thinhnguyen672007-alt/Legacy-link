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
