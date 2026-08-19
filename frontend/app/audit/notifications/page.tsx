import { redirect } from "next/navigation";

export default function AuditNotificationsPage() {
  redirect("/audit/settings?tab=notifications");
}
