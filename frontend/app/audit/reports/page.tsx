"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { ReportsRegister } from "@/components/reports/ReportsRegister";
import { Button } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { T, useI18n } from "@/lib/i18n";

export default function ReportsPage() {
  useI18n();
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={T.reports.title}
        description={T.reports.subtitle}
        actions={
          <Link href="/audit/reports/new">
            <Button>
              <Plus className="size-4" />
              {T.reports.addReport}
            </Button>
          </Link>
        }
      />
      <ReportsRegister />
    </div>
  );
}
