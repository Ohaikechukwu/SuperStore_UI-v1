"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { applyTenantTheme, readCachedTenantThemeSnapshot, subscribeTenantTheme, type TenantTheme } from "@/tenantTheme";

const TenantThemeContext = createContext<TenantTheme | null>(null);

/**
 * The initial value is resolved by the root server layout. Consequently every
 * client component receives the tenant brand while it is being rendered into
 * the first HTML response, rather than waiting for its own API request.
 */
export default function TenantThemeProvider({ initialTheme, children }: {
  initialTheme: TenantTheme | null;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);

  useLayoutEffect(() => {
    if (initialTheme) applyTenantTheme(initialTheme);
    const sync = () => setTheme(readCachedTenantThemeSnapshot());
    sync();
    return subscribeTenantTheme(sync);
  }, [initialTheme]);

  return <TenantThemeContext.Provider value={theme}>{children}</TenantThemeContext.Provider>;
}

export function useTenantTheme() {
  return useContext(TenantThemeContext);
}
