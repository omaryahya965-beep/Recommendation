import DashboardShell from "@/components/shell/DashboardShell";

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="department_head">{children}</DashboardShell>;
}
