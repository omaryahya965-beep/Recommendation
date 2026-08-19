import { redirect } from "next/navigation";

export default function DepartmentReminderSettingsRedirect() {
  redirect("/department/settings?tab=reminders");
}
