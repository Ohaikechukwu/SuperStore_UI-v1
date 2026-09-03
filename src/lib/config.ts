const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const configuredProxyPath = process.env.NEXT_PUBLIC_API_PROXY_PATH;

// A browser hosted on Vercel must not call an ngrok API directly: doing so
// turns the refresh cookie into a cross-site cookie and also makes ngrok's
// browser-warning bypass trigger a CORS preflight. Route that traffic through
// the same-origin Next rewrite instead. The ngrok fallback keeps existing
// deployments working while they move to the explicit variables below.
export const API_BASE = configuredProxyPath
  ?? (/^https:\/\/[^/]+\.ngrok-free\.app(?:\/|$)/i.test(configuredApiUrl)
    ? "/edge-api"
    : configuredApiUrl);
export const DEFAULT_TENANT = process.env.NEXT_PUBLIC_TENANT_KEY ?? "";

/**
 * Free ngrok endpoints place a browser-warning page in front of API calls
 * unless this header is supplied. Keep that transport concern at the API
 * boundary so application requests do not rely on service-worker timing.
 */
export function apiRequestHeaders(apiBase: string, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (apiBase === "/edge-api" || /^https:\/\/[^/]+\.ngrok-free\.app(?:\/|$)/i.test(apiBase)) {
    result.set("ngrok-skip-browser-warning", "1");
  }
  return result;
}
