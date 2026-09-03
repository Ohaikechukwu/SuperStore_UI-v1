import PlatformCommandCenter from "@/components/platform-command-center";

/**
 * Human-readable platform-admin route used by links under /a/<admin-id>.
 * The tenant directory remains available at /platform/tenants as well.
 */
export default function CommandCenterPage() {
  return <PlatformCommandCenter />;
}
