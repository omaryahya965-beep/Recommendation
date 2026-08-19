import { redirect } from "next/navigation";

export default function CouncilSettingsNotificationsRedirect() {
  redirect("/council/settings?tab=notifications");
}
