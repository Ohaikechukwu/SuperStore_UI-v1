import TenantLogoutPage from "@/components/tenant-logout-page";
import { resolveInitialTenantTheme } from "@/lib/tenant-theme-server";

export default async function TenantLogoutRoute({ params }: { params: Promise<{ tenantPublicId: string }> }) {
  const { tenantPublicId } = await params;
  const initialTheme = await resolveInitialTenantTheme(tenantPublicId);
  return <TenantLogoutPage tenantPublicId={tenantPublicId} initialTheme={initialTheme} />;
}
