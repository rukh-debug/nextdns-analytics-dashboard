import { DashboardShell } from "@/components/layout/dashboard-shell";
import { isAuthEnabled } from "@/lib/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell authEnabled={isAuthEnabled()}>{children}</DashboardShell>;
}
