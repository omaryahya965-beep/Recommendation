import { redirect } from "next/navigation";

export default function DepartmentSettingsNotificationsRedirect() {
  redirect("/department/settings?tab=notifications");
}
