export type TenantTheme = {
  public_id: string;
  slug: string;
  name: string;
  currency: string;
  settings: {
    brand_name: string;
    logo_url: string | null;
    favicon_url: string | null;
    login_background_url: string | null;
    login_eyebrow: string | null;
    login_headline: string | null;
    login_description: string | null;
    login_footer: string | null;
    login_badges: string[];
    primary_color: string;
    secondary_color: string;
    timezone: string;
    enabled_modules: string[];
    licensed_modules: string[];
    feature_flags: Record<string, unknown>;
  };
};

const PLATFORM_TITLE = "Superstore Health Suite";
const PLATFORM_FAVICON = "/icon.svg";
// Wide enough for a remote tunnel (ngrok) whose baseline round trip can
// already exceed six seconds before any queuing.
const THEME_REQUEST_TIMEOUT_MS = 20_000;

// This is deliberately memory-only. A tenant theme must be obtained from the
// backend for the currently selected tenant or authenticated session; it must
// never be recovered from a prior browser user's local storage.
let activeTheme: TenantTheme | null = null;
let legacyThemeCacheCleared = false;

async function fetchTheme(url: string) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), THEME_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function setFavicon(href: string) {
  if (typeof document === "undefined") return;
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.append(icon);
  }
  icon.href = href;
}

function clearLegacyThemeCache() {
  if (typeof window === "undefined" || legacyThemeCacheCleared) return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("superstore.tenant_theme:")) window.localStorage.removeItem(key);
  }
  legacyThemeCacheCleared = true;
}

function publishThemeChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<TenantTheme | null>("superstore:tenant-theme", { detail: activeTheme }));
  }
}

export function applyTenantTheme(theme: TenantTheme) {
  if (typeof window === "undefined") return;
  activeTheme = theme;
  document.documentElement.style.setProperty("--tenant-primary", theme.settings.primary_color);
  document.documentElement.style.setProperty("--tenant-secondary", theme.settings.secondary_color);
  document.title = theme.settings.brand_name || theme.name || PLATFORM_TITLE;
  setFavicon(theme.settings.favicon_url || PLATFORM_FAVICON);
  publishThemeChange();
}

export function resetPlatformTheme() {
  if (typeof window === "undefined") return;
  activeTheme = null;
  document.documentElement.style.removeProperty("--tenant-primary");
  document.documentElement.style.removeProperty("--tenant-secondary");
  document.title = PLATFORM_TITLE;
  setFavicon(PLATFORM_FAVICON);
  clearLegacyThemeCache();
  publishThemeChange();
}

export async function resolveTenantTheme(apiBase: string, tenantPublicId: string): Promise<TenantTheme> {
  const response = await fetchTheme(
    `${apiBase}/api/v1/catalog/tenant/resolve?public_id=${encodeURIComponent(tenantPublicId)}`,
  );
  if (!response.ok) throw new Error(`tenant resolution failed (${response.status})`);
  return response.json() as Promise<TenantTheme>;
}

export async function loadTenantTheme(apiBase: string, tenantPublicId: string): Promise<TenantTheme> {
  const theme = await resolveTenantTheme(apiBase, tenantPublicId);
  applyTenantTheme(theme);
  return theme;
}

export function subscribeTenantTheme(callback: () => void) {
  window.addEventListener("superstore:tenant-theme", callback);
  return () => window.removeEventListener("superstore:tenant-theme", callback);
}

export function readCachedTenantThemeSnapshot(): TenantTheme | null {
  return activeTheme;
}
