export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const DEFAULT_TENANT = process.env.NEXT_PUBLIC_TENANT_KEY ?? "";

/**
 * Free ngrok endpoints place a browser-warning page in front of API calls
 * unless this header is supplied. Keep that transport concern at the API
 * boundary so application requests do not rely on service-worker timing.
 */
export function apiRequestHeaders(apiBase: string, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (/^https:\/\/[^/]+\.ngrok-free\.app(?:\/|$)/i.test(apiBase)) {
    result.set("ngrok-skip-browser-warning", "1");
  }
  return result;
}
