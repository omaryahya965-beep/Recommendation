"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FilePlus2, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Callout, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui/Base";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, errorMessage } from "@/lib/api";
import { ENGAGEMENT_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport, Department, Paginated } from "@/lib/types";

export default function NewReportPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [engagementType, setEngagementType] = useState("assurance");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AuditReport | null>(null);

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api<Paginated<Department>>("/api/departments/"),
  });

  const createReport = useMutation({
    mutationFn: () =>
      api<AuditReport>("/api/reports/", {
        method: "POST",
        body: {
          title,
          department: Number(department),
          engagement_type: engagementType,
          response_deadline: deadline || null,
        },
      }),
    onSuccess: (report) => {
      setError(null);
      setCreated(report);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  if (created) {
    return (
      <div className="mx-auto max-w-xl animate-fade-in space-y-6">
        <PageHeader title={T.reports.createdTitle} description={created.title} />
        <Card className="border-s-4 border-s-success p-6">
          <Callout tone="success" icon={<Check className="size-4.5" />} title={T.reports.createdTitle}>
            {T.reports.createdHint}
          </Callout>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => router.push(`/audit/recommendations/new?report=${created.id}`)} className="font-bold shadow-md gap-2">
              <FilePlus2 className="size-4.5" />
              {T.reports.addNow}
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/audit/reports/${created.id}`)} className="font-bold shadow-sm ring-1 ring-line">
              <FileText className="size-4.5" />
              {T.reports.addLater}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl animate-fade-in space-y-6">
      <PageHeader title={T.reports.create} description={T.reports.createHint} />

      <Card className="p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createReport.mutate();
          }}
          className="grid gap-5"
        >
          <Field label={T.reports.reportTitle}>
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          </Field>
          <Field label={T.common.department}>
            <Select value={department} onChange={(event) => setDepartment(event.target.value)} required>
              <option value="">— {T.common.none} —</option>
              {departments?.results.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={T.create.engagement}>
            <Select value={engagementType} onChange={(event) => setEngagementType(event.target.value)}>
              <option value="assurance">{ENGAGEMENT_TYPE_LABELS.assurance}</option>
              <option value="advisory">{ENGAGEMENT_TYPE_LABELS.advisory}</option>
            </Select>
          </Field>
          <Field label={T.create.deadline}>
            <TextInput type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </Field>

          <ErrorBanner message={error} />

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-line/60">
            <Button type="submit" disabled={createReport.isPending || !title.trim() || !department} className="font-bold shadow-md">
              {T.common.save}
            </Button>
            <Link
              href="/audit/reports"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-navy transition-colors"
            >
              <DirBack className="size-4" />
              {T.common.cancel}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
