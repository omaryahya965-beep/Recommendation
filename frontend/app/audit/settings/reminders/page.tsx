import { redirect } from "next/navigation";

export default function AuditReminderSettingsRedirect() {
  redirect("/audit/settings?tab=reminders");
}
