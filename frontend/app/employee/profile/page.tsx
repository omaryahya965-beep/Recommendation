"use client";

import { ProfilePage } from "@/components/profile/ProfilePage";
import { useI18n } from "@/lib/i18n";

export default function EmployeeProfileRoute() {
  useI18n();
  return <ProfilePage role="employee" />;
}
