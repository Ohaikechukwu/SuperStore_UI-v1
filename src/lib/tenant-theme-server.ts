import { cache } from "react";
import type { TenantTheme } from "@/tenantTheme";

// Server rendering cannot fetch a relative browser proxy path. Use the
// private upstream value that also powers the /edge-api rewrite.
const API_BASE = process.env.EDGE_API_UPSTREAM
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? "http://localhost:8000";
const PUBLIC_TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const upstreamRequiresNgrokBypass = /^https:\/\/[^/]+\.ngrok-free\.app(?:\/|$)/i.test(API_BASE);

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
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    return await response.json() as TenantTheme;
  } catch {
    // The platform theme remains a safe fallback if the API is temporarily unavailable.
    return null;
  }
});
