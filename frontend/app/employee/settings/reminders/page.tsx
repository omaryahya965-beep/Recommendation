import { redirect } from "next/navigation";

export default function EmployeeReminderSettingsRedirect() {
  redirect("/employee/settings?tab=reminders");
}
