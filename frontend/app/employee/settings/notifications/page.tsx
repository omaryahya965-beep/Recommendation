import { redirect } from "next/navigation";

export default function EmployeeSettingsNotificationsRedirect() {
  redirect("/employee/settings?tab=notifications");
}
