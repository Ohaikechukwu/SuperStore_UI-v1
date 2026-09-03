import { resetPlatformTheme } from "@/tenantTheme";
import { apiRequestHeaders } from "@/lib/config";

export type TokenPair = {
  access_token: string;
  refresh_token?: string;
  token_type: "bearer";
  password_change_required: boolean;
  tenant_public_id?: string;
};

const ACCESS_KEY = "superstore.access_token";
const SESSION_ACCESS_KEY = "superstore.session_access_token";
const SESSION_AUTHORIZATION_KEY = "superstore.session_authorization";
const TENANT_KEY = "superstore.tenant_key";
const TENANT_ROUTE_COOKIE = "superstore.tenant_public_id";
const PLATFORM_ADMIN_KEY = "superstore.platform_admin_public_id";
let memoryAccessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const PUBLIC_TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      headers: apiRequestHeaders(String(input), init.headers),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

function storage() {
  if (typeof window === "undefined") throw new Error("auth storage is browser-only");
  // Remove legacy sensitive browser caches. Tenant configuration is fetched
  // from the backend and location is never required for authentication.
  window.localStorage.removeItem("userLocationData");
  window.sessionStorage.removeItem("superstore.tenant_theme");
  return window.localStorage;
}

export function saveTokens(tokens: TokenPair) {
  memoryAccessToken = tokens.access_token;
  storage().setItem(SESSION_ACCESS_KEY, tokens.access_token);
  storage().removeItem(ACCESS_KEY);
  storage().removeItem("superstore.refresh_token");
  if (tokens.tenant_public_id) saveTenantPublicId(tokens.tenant_public_id);
}

export function clearTokens({ resetTheme = true }: { resetTheme?: boolean } = {}) {
  // Service-worker route shells and IndexedDB queues are tenant-bound.  A
  // sign-out is an explicit privacy boundary, so do not leave prior work for
  // the next person using this browser.
  navigator.serviceWorker?.controller?.postMessage({ type: "superstore:purge-offline-data" });
  void import("@/offlineQueue").then(({ clearOfflineData }) => clearOfflineData()).catch(() => undefined);
  memoryAccessToken = null;
  storage().removeItem(SESSION_ACCESS_KEY);
  window.sessionStorage.removeItem(SESSION_AUTHORIZATION_KEY);
  storage().removeItem(ACCESS_KEY);
  storage().removeItem("superstore.refresh_token");
  storage().removeItem(TENANT_KEY);
  storage().removeItem(PLATFORM_ADMIN_KEY);
  document.cookie = `${TENANT_ROUTE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  if (resetTheme) resetPlatformTheme();
}

export function tenantPublicId() {
  if (typeof window === "undefined") return null;
  return storage().getItem(TENANT_KEY);
}

export function saveTenantPublicId(value: string) {
  storage().setItem(TENANT_KEY, value);
  document.cookie = `${TENANT_ROUTE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

/** Removes the route hint without touching the authenticated session. */
export function clearTenantRoute() {
  storage().removeItem(TENANT_KEY);
  document.cookie = `${TENANT_ROUTE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function tenantLoginPath() {
  const value = tenantPublicId();
  return value && PUBLIC_TENANT_ID_PATTERN.test(value) ? `/t/${value}/login` : "/";
}

/** The opaque identity of the dedicated platform-super-admin console. */
export function savePlatformAdminPublicId(value: string) {
  if (!PUBLIC_TENANT_ID_PATTERN.test(value)) return;
  storage().setItem(PLATFORM_ADMIN_KEY, value);
}

export function platformAdminPublicId() {
  if (typeof window === "undefined") return null;
  const value = storage().getItem(PLATFORM_ADMIN_KEY);
  return value && PUBLIC_TENANT_ID_PATTERN.test(value) ? value : null;
}

export function platformConsolePath(suffix = "") {
  const value = platformAdminPublicId();
  return value ? `/a/${value}${suffix}` : "/";
}

/** The right post-auth destination without exposing a shared sign-in route. */
export function signedInHomePath() {
  const platformId = platformAdminPublicId();
  if (platformId) return `/a/${platformId}`;
  const tenantId = tenantPublicId();
  return tenantId && PUBLIC_TENANT_ID_PATTERN.test(tenantId) ? `/t/${tenantId}` : "/";
}

export function accessToken() {
  if (!memoryAccessToken && typeof window !== "undefined") memoryAccessToken = window.sessionStorage.getItem(SESSION_ACCESS_KEY);
  return memoryAccessToken;
}

function browserDeviceId() {
  const key = "superstore.browser_device_id";
  const existing = storage().getItem(key);
  if (existing) return existing;
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage().setItem(key, value);
  return value;
}

export async function login(apiBase: string, tenantPublicId: string, email: string, password: string, platformConsole = false) {
  const response = await fetchWithTimeout(`${apiBase}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenant_public_id: tenantPublicId, email, password, device_id: browserDeviceId(), platform_console: platformConsole }),
  });
  if (!response.ok) throw new Error("login failed");
  const tokens: TokenPair = await response.json();
  saveTokens(tokens);
  saveTenantPublicId(tenantPublicId);
  return tokens;
}

async function performRefresh(apiBase: string) {
  const response = await fetchWithTimeout(`${apiBase}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: "{}",
  });
  if (!response.ok) {
    clearTokens();
    return false;
  }
  saveTokens(await response.json());
  return true;
}

// A page can mount several data loaders at once. Refresh tokens rotate on use,
// so all of those loaders must await the same refresh rather than racing each
// other with the old cookie.
export function refreshSession(apiBase: string) {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh(apiBase).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch(apiBase: string, path: string, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  // Access tokens intentionally live only in memory. Restore one from the
  // HttpOnly refresh cookie before issuing protected page-load requests.
  if (!accessToken()) await refreshSession(apiBase);
  const headers = new Headers(init.headers);
  const token = accessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response = await fetchWithTimeout(`${apiBase}${path}`, { ...init, headers, credentials: "include" }, timeoutMs);
  if (response.status === 401 && await refreshSession(apiBase)) {
    headers.set("authorization", `Bearer ${accessToken()}`);
    response = await fetchWithTimeout(`${apiBase}${path}`, { ...init, headers, credentials: "include" }, timeoutMs);
  }
  if (response.status === 401) clearTokens();
  return response;
}
