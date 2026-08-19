import { redirect } from "next/navigation";

export default function CouncilNotificationsPage() {
  redirect("/council/settings?tab=notifications");
}
