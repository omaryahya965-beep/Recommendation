import DashboardShell from "@/components/shell/DashboardShell";

export default function CouncilLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="council">{children}</DashboardShell>;
}
