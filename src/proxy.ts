import { NextRequest, NextResponse } from "next/server";

const TENANT_ROUTE_COOKIE = "superstore.tenant_public_id";
const PUBLIC_TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Keeps a tenant's opaque public ID in the visible browser path while serving
 * the existing application page tree. The API remains outside this rewrite.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminRoute = pathname.match(/^\/a\/([^/]+)(?:\/(.*))?$/);
  const tenantRoute = pathname.match(/^\/t\/([^/]+)(?:\/(.*))?$/);

  if (adminRoute) {
    const [, adminPublicId, rest = ""] = adminRoute;
    if (!PUBLIC_TENANT_ID_PATTERN.test(adminPublicId)) return NextResponse.next();
    // /a is platform-global, not a tenant workspace. Never let its route
    // inherit a tenant theme or retain a prior tenant route cookie.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-platform-admin-public-id", adminPublicId);
    if (rest === "login") {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.cookies.delete(TENANT_ROUTE_COOKIE);
      return response;
    }

    const destination = request.nextUrl.clone();
    destination.pathname = rest ? `/platform/${rest}` : "/platform";
    const response = NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
    response.cookies.delete(TENANT_ROUTE_COOKIE);
    return response;
  }

  if (tenantRoute) {
    const [, tenantPublicId, rest = ""] = tenantRoute;
    if (!PUBLIC_TENANT_ID_PATTERN.test(tenantPublicId)) return NextResponse.next();
    // Forward the route identity to server components. This lets the initial
    // document include the correct tenant CSS variables and metadata, before
    // the browser has a chance to paint the platform defaults.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-public-id", tenantPublicId);
    // This page needs the route parameter so it can resolve pre-login branding.
    if (rest === "login" || rest === "logout") return NextResponse.next({ request: { headers: requestHeaders } });

    const destination = request.nextUrl.clone();
    destination.pathname = `/${rest}`;
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }

  // The platform root is public marketing, even after a browser previously
  // visited a tenant. Keep the public identity independent of tenant routing.
  if (pathname === "/" || pathname === "/pricing") {
    const response = pathname === "/"
      ? NextResponse.rewrite(new URL("/pricing", request.url))
      : NextResponse.next();
    response.cookies.delete(TENANT_ROUTE_COOKIE);
    return response;
  }

  // There is no shared platform sign-in page. Tenant users use their explicit
  // /t/<tenant-id>/login link and platform super administrators use
  // /a/<platform-id>/login. Preserve old bookmarks by taking them home.
  if (pathname === "/login") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete(TENANT_ROUTE_COOKIE);
    return response;
  }

  const tenantPublicId = request.cookies.get(TENANT_ROUTE_COOKIE)?.value;
  if (tenantPublicId && PUBLIC_TENANT_ID_PATTERN.test(tenantPublicId)) {
    const destination = request.nextUrl.clone();
    destination.pathname = `/t/${tenantPublicId}${pathname === "/" ? "/" : pathname}`;
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
