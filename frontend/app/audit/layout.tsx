import DashboardShell from "@/components/shell/DashboardShell";

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="audit">{children}</DashboardShell>;
}
