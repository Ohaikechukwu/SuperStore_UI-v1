import { api } from "@/lib/api";

export type AuthorizationContext = {
  user_id: string;
  tenant_id: string;
  tenant_public_id: string | null;
  role: string;
  role_id: string | null;
  is_global_role: boolean;
  branch_ids: string[];
  attributes: Record<string, unknown>;
  membership_attributes: Record<string, unknown>;
  permissions: string[];
  denied_permissions: string[];
  licensed_modules: string[];
  policies: Array<{ permission_code: string; effect: "allow" | "deny"; conditions: Record<string, unknown> }>;
};

// DashboardShell and PermissionGate commonly mount together. Share the one
// in-flight request so each tab does not ask the auth endpoint twice during
// its initial render. The promise is deliberately not retained after it
// settles: permissions can change while a user keeps a tab open.
let authorizationInFlight: Promise<AuthorizationContext> | null = null;
const AUTHORIZATION_CACHE_KEY = "superstore.session_authorization";

export function readCachedAuthorizationContext(): AuthorizationContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTHORIZATION_CACHE_KEY);
    const context = raw ? JSON.parse(raw) as AuthorizationContext : null;
    return context?.user_id && context.tenant_id && context.role ? context : null;
  } catch {
    return null;
  }
}

function cacheAuthorizationContext(context: AuthorizationContext) {
  window.sessionStorage.setItem(AUTHORIZATION_CACHE_KEY, JSON.stringify(context));
  return context;
}

export function loadAuthorizationContext() {
  if (!authorizationInFlight) {
    authorizationInFlight = api.get<AuthorizationContext>("/api/v1/auth/me/authorization")
      .then(cacheAuthorizationContext)
      .finally(() => { authorizationInFlight = null; });
  }
  return authorizationInFlight;
}

export function can(context: AuthorizationContext | null, permission: string) {
  return Boolean(context?.permissions.includes(permission) && !context.denied_permissions.includes(permission));
}

export function hasModule(context: AuthorizationContext | null, module: string) {
  return Boolean(context && (context.role === "platform_super_admin" || (context.role === "patient" && module === "hospital") || context.licensed_modules.includes(module)));
}
