"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { resetPlatformTheme } from "@/tenantTheme";

const PLATFORM_ROUTES = new Set([
  "/", "/pricing", "/signup", "/subscribe", "/forgot-password", "/reset-password", "/verify-email",
]);

/** Keeps marketing and account-recovery routes independent from tenant state. */
export default function PlatformThemeReset() {
  const pathname = usePathname();
  const isTenantRoute = /^\/t\/[0-9a-f-]+(?:\/|$)/i.test(pathname);
  const isPlatformConsoleRoute = /^\/a\/[0-9a-f-]+(?:\/|$)/i.test(pathname);
  const platformPathname = pathname.replace(/^\/t\/[0-9a-f-]+(?=\/|$)/i, "") || "/";

  useEffect(() => {
    // /t/<public-id>/login is a tenant page even though it renders the login
    // screen. Resetting here would erase the theme that arrived in the HTML.
    if (isPlatformConsoleRoute || (!isTenantRoute && PLATFORM_ROUTES.has(platformPathname))) resetPlatformTheme();
  }, [isPlatformConsoleRoute, isTenantRoute, platformPathname]);

  return null;
}
