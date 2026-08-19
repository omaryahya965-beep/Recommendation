import DashboardShell from "@/components/shell/DashboardShell";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="employee">{children}</DashboardShell>;
}
