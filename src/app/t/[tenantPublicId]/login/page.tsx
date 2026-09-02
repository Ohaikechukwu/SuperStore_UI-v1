import { TenantLoginPage } from "@/app/login/page";
import { resolveInitialTenantTheme } from "@/lib/tenant-theme-server";

export default async function TenantLoginRoute({ params }: { params: Promise<{ tenantPublicId: string }> }) {
  const { tenantPublicId } = await params;
  const initialTheme = await resolveInitialTenantTheme(tenantPublicId);
  return <TenantLoginPage tenantPublicId={tenantPublicId} initialTheme={initialTheme} />;
}
