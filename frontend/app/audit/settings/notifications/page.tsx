import { redirect } from "next/navigation";

export default function AuditSettingsNotificationsRedirect() {
  redirect("/audit/settings?tab=notifications");
}
