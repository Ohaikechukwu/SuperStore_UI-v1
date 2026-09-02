import { TenantLoginPage } from "@/app/login/page";

export default async function PlatformAdminLoginRoute({ params }: { params: Promise<{ adminPublicId: string }> }) {
  const { adminPublicId } = await params;
  return <TenantLoginPage tenantPublicId={adminPublicId} authenticatedRedirect={`/a/${adminPublicId}`} platformAdminLogin />;
}
