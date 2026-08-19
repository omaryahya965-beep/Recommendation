import { redirect } from "next/navigation";

export default function EmployeeNotificationsPage() {
  redirect("/employee/settings?tab=notifications");
}
