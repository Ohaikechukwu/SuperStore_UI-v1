import { resetPlatformTheme } from "@/tenantTheme";
import { apiRequestHeaders } from "@/lib/config";

export type TokenPair = {
  access_token: string;
  token_type: "bearer";
  password_change_required: boolean;
  tenant_public_id?: string;
};

const LEGACY_BROWSER_KEYS = new Set([
  "superstore.access_token", "superstore.session_access_token", "superstore.session_authorization",
  "superstore.tenant_key", "superstore.platform_admin_public_id", "superstore.refresh_token",
  "superstore.browser_device_id", "userLocationData",
]);
const TENANT_ROUTE_COOKIE = "superstore.tenant_public_id";
const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const PUBLIC_TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Browser-readable credentials and user context exist only for the current
// JavaScript runtime. The HttpOnly refresh cookie is the sole durable browser
// session artifact.
let memoryAccessToken: string | null = null;
let memoryTenantPublicId: string | null = null;
let memoryPlatformAdminPublicId: string | null = null;
let memoryDeviceId: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, headers: apiRequestHeaders(String(input), init.headers), signal: controller.signal });
  } finally { window.clearTimeout(timer); }
}

function removeLegacyBrowserState() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_BROWSER_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (key?.startsWith("superstore.sync.") || key?.startsWith("superstore.tenant_theme:")) store.removeItem(key);
    }
  }
  document.cookie = `${TENANT_ROUTE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function pathId(prefix: "t" | "a") {
  if (typeof window === "undefined") return null;
  return window.location.pathname.match(new RegExp(`^/${prefix}/([0-9a-f-]+)(?:/|$)`, "i"))?.[1] || null;
}

// Upgrade cleanup runs before a user signs in, so stale browser databases
// from releases that supported offline persistence are not retained.
if (typeof window !== "undefined") {
  removeLegacyBrowserState();
  void import("@/offlineQueue").then(({ clearOfflineData }) => clearOfflineData()).catch(() => undefined);
}

export function saveTokens(tokens: TokenPair) {
  memoryAccessToken = tokens.access_token;
  if (tokens.tenant_public_id && PUBLIC_TENANT_ID_PATTERN.test(tokens.tenant_public_id)) memoryTenantPublicId = tokens.tenant_public_id;
  removeLegacyBrowserState();
}

export function clearTokens({ resetTheme = true }: { resetTheme?: boolean } = {}) {
  memoryAccessToken = null;
  memoryTenantPublicId = null;
  memoryPlatformAdminPublicId = null;
  memoryDeviceId = null;
  removeLegacyBrowserState();
  window.dispatchEvent(new Event("superstore:auth-cleared"));
  navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage({ type: "superstore:purge-offline-data" }))
    .catch(() => navigator.serviceWorker?.controller?.postMessage({ type: "superstore:purge-offline-data" }));
  void import("@/offlineQueue").then(({ clearOfflineData }) => clearOfflineData()).catch(() => undefined);
  if (resetTheme) resetPlatformTheme();
}

export function tenantPublicId() {
  const value = pathId("t");
  return value && PUBLIC_TENANT_ID_PATTERN.test(value) ? value : memoryTenantPublicId;
}

export function saveTenantPublicId(value: string) { if (PUBLIC_TENANT_ID_PATTERN.test(value)) memoryTenantPublicId = value; }
export function clearTenantRoute() { memoryTenantPublicId = null; }
export function tenantLoginPath() { const value = tenantPublicId(); return value && PUBLIC_TENANT_ID_PATTERN.test(value) ? `/t/${value}/login` : "/"; }
export function savePlatformAdminPublicId(value: string) { if (PUBLIC_TENANT_ID_PATTERN.test(value)) memoryPlatformAdminPublicId = value; }
export function platformAdminPublicId() {
  const value = pathId("a");
  return value && PUBLIC_TENANT_ID_PATTERN.test(value) ? value : memoryPlatformAdminPublicId;
}
export function platformConsolePath(suffix = "") { const value = platformAdminPublicId(); return value ? `/a/${value}${suffix}` : "/"; }
export function signedInHomePath() {
  const platformId = platformAdminPublicId();
  if (platformId) return `/a/${platformId}`;
  const tenantId = tenantPublicId();
  return tenantId && PUBLIC_TENANT_ID_PATTERN.test(tenantId) ? `/t/${tenantId}` : "/";
}
export function accessToken() { return memoryAccessToken; }

function browserDeviceId() {
  memoryDeviceId ??= typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return memoryDeviceId;
}

export async function login(apiBase: string, tenantPublicId: string, email: string, password: string, platformConsole = false) {
  const response = await fetchWithTimeout(`${apiBase}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
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
    method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: "{}",
  });
  if (!response.ok) { clearTokens(); return false; }
  saveTokens(await response.json());
  return true;
}

export function refreshSession(apiBase: string) {
  if (!refreshInFlight) {
    const run = async () => {
      // A rotating cookie is shared by all tabs. The Web Locks API coordinates
      // refresh without storing any session data in the browser.
      if (navigator.locks) return navigator.locks.request("superstore:refresh", () => performRefresh(apiBase));
      return performRefresh(apiBase);
    };
    refreshInFlight = run().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiFetch(apiBase: string, path: string, init: RequestInit = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  if (!accessToken()) await refreshSession(apiBase);
  const headers = new Headers(init.headers);
  const token = accessToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response = await fetchWithTimeout(`${apiBase}${path}`, { ...init, headers, credentials: "include" }, timeoutMs);
  if (response.status === 401 && await refreshSession(apiBase)) {
    const refreshed = accessToken();
    if (refreshed) headers.set("authorization", `Bearer ${refreshed}`);
    response = await fetchWithTimeout(`${apiBase}${path}`, { ...init, headers, credentials: "include" }, timeoutMs);
  }
  return response;
}
