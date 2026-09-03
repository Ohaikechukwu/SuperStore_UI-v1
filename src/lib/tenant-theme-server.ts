import { cache } from "react";
import type { TenantTheme } from "@/tenantTheme";

// Server rendering cannot fetch a relative browser proxy path. Use the
// private upstream value that also powers the /edge-api rewrite.
const API_BASE = process.env.EDGE_API_UPSTREAM
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? "http://localhost:8000";
const PUBLIC_TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const upstreamRequiresNgrokBypass = /^https:\/\/[^/]+\.ngrok-free\.app(?:\/|$)/i.test(API_BASE);
const THEME_FETCH_TIMEOUT_MS = 8_000;
// A remote tunnel (e.g. ngrok) can blip past this timeout under load. Serving
// the last successfully fetched theme beats repainting platform defaults the
// client cannot quickly correct.
const LAST_GOOD_TTL_MS = 5 * 60_000;
const lastGoodTheme = new Map<string, { theme: TenantTheme; at: number }>();

function lastGood(tenantPublicId: string): TenantTheme | null {
  const entry = lastGoodTheme.get(tenantPublicId);
  if (!entry || Date.now() - entry.at > LAST_GOOD_TTL_MS) return null;
  return entry.theme;
}

/**
 * Resolves the theme while rendering the document, not after hydration. The
 * request is memoized per render so metadata and layout share one API call.
 */
export const resolveInitialTenantTheme = cache(async (tenantPublicId: string | null): Promise<TenantTheme | null> => {
  if (!tenantPublicId || !PUBLIC_TENANT_ID_PATTERN.test(tenantPublicId)) return null;

  try {
    const response = await fetch(
      `${API_BASE}/api/v1/catalog/tenant/resolve?public_id=${encodeURIComponent(tenantPublicId)}`,
      {
        cache: "no-store",
        headers: upstreamRequiresNgrokBypass ? { "ngrok-skip-browser-warning": "1" } : undefined,
        signal: AbortSignal.timeout(THEME_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) return lastGood(tenantPublicId);
    const theme = await response.json() as TenantTheme;
    lastGoodTheme.set(tenantPublicId, { theme, at: Date.now() });
    return theme;
  } catch {
    // The platform theme remains a safe fallback if the API is temporarily
    // unavailable and this instance has never resolved the tenant before.
    return lastGood(tenantPublicId);
  }
});
