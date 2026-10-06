"use client";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useI18n } from "@/lib/i18n";

export default function EmployeeNotificationsPage() {
  useI18n();
  return (
    <div className="animate-fade-in">
      <NotificationCenter role="employee" />
    </div>
  );
}
