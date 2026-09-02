import type { Metadata } from "next";
import { headers } from "next/headers";
import PlatformThemeReset from "@/components/platform-theme-reset";
import PwaRegistration from "@/components/pwa-registration";
import TenantThemeProvider from "@/components/tenant-theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { resolveInitialTenantTheme } from "@/lib/tenant-theme-server";
import "./globals.css";

const platformMetadata: Metadata = {
  title: "Superstore Health Suite",
  description: "Store, pharmacy, and hospital operations in one workspace.",
  icons: { icon: "/icon.svg" },
};

async function initialTenantTheme() {
  const requestHeaders = await headers();
  return resolveInitialTenantTheme(requestHeaders.get("x-tenant-public-id"));
}

export async function generateMetadata(): Promise<Metadata> {
  const theme = await initialTenantTheme();
  if (!theme) return platformMetadata;

  return {
    ...platformMetadata,
    title: theme.settings.brand_name || theme.name || platformMetadata.title,
    icons: { icon: theme.settings.favicon_url || "/icon.svg" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await initialTenantTheme();
  const tenantStyle = theme
    ? ({
        "--tenant-primary": theme.settings.primary_color,
        "--tenant-secondary": theme.settings.secondary_color,
      } as React.CSSProperties)
    : undefined;

  return (
    <html lang="en" style={tenantStyle}>
      {/* Extensions (e.g. Grammarly) inject attributes like data-gr-ext-installed
          onto <body> before hydration; suppress the harmless mismatch warning. */}
      <body suppressHydrationWarning>
        <TenantThemeProvider initialTheme={theme}>
          <PlatformThemeReset />
          <PwaRegistration />
          <ToastProvider>{children}</ToastProvider>
        </TenantThemeProvider>
      </body>
    </html>
  );
}
