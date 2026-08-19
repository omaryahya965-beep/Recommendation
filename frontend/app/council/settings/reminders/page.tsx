import { redirect } from "next/navigation";

export default function CouncilReminderSettingsRedirect() {
  redirect("/council/settings?tab=reminders");
}
