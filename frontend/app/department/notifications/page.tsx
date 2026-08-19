import { redirect } from "next/navigation";

export default function DepartmentNotificationsPage() {
  redirect("/department/settings?tab=notifications");
}
