import DashboardShell from "@/components/dashboard-shell";
import DirectMessages from "@/components/direct-messages";

export default function MessagesPage() {
  return <DashboardShell title="Direct messages" subtitle="Secure internal conversations with your colleagues and management"><DirectMessages /></DashboardShell>;
}
