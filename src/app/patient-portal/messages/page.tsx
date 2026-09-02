import DashboardShell from "@/components/dashboard-shell";
import DirectMessages from "@/components/direct-messages";
import PermissionGate from "@/components/permission-gate";

export default function PatientMessagesPage() {
  return <DashboardShell title="Care team messages" subtitle="Secure, non-urgent messages with the clinicians assigned to your care"><PermissionGate permission="patient.portal.access" module="hospital"><main className="space-y-5"><p className="mx-auto max-w-[1180px] rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Do not use messages for urgent or life-threatening symptoms. Call emergency services or visit the nearest emergency department.</p><DirectMessages patient /></main></PermissionGate></DashboardShell>;
}
