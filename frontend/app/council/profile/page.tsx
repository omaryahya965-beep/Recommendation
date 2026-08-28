"use client";

import { ProfilePage } from "@/components/profile/ProfilePage";
import { useI18n } from "@/lib/i18n";

export default function CouncilProfileRoute() {
  useI18n();
  return <ProfilePage role="council" />;
}
