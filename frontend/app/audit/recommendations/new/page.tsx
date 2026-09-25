"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileText, Save, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  Button,
  Callout,
  Card,
  ChoiceCards,
  DataField,
  ErrorBanner,
  Field,
  ProseBlock,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui/Base";
import { DashboardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, errorMessage } from "@/lib/api";
import { invalidateRecommendationViews } from "@/lib/queryPolicy";
import {
  composeFinding,
  EMPTY_FINDING,
  localizedFindingSections,
  type FindingDraft,
  type FindingSectionId,
} from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { REPORT_TYPE_LABELS, RISK_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport, Paginated } from "@/lib/types";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

type StepId = "context" | "finding" | "recommendation" | "risk" | "review";

function wizardSteps(): Array<{ id: StepId; label: string }> {
  return [
    { id: "context" as const, label: T.create.stepContext },
    { id: "finding" as const, label: T.create.stepFinding },
    { id: "risk" as const, label: T.create.stepRisk },
    { id: "recommendation" as const, label: T.create.stepRecommendation },
    { id: "review" as const, label: T.create.stepReview },
  ];
}

const FINDING_IDS: FindingSectionId[] = ["title", "condition", "criteria", "effect", "notes"];
const RECOMMENDATION_IDS: FindingSectionId[] = [
  "statement",
  "objective",
  "required_action",
  "outcome",
  "success",
  "evidence",
];

function StepRail({ current, onJump }: { current: number; onJump: (index: number) => void }) {
  useI18n();
  return (
    <ol className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm md:flex-row md:overflow-x-auto md:scrollbar-thin">
      {wizardSteps().map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onJump(index)}
              disabled={index > current}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-12 w-full items-center gap-2.5 rounded-lg px-4 py-2.5 text-start text-[14px] font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "bg-primary text-white shadow-md ring-2 ring-primary/20"
                  : done
                    ? "bg-primary-light/50 text-primary-dark hover:bg-primary-light/75 border border-primary/10"
                    : "text-ink-soft hover:bg-subtle/50"
              }`}
            >
              <span
                className={`flex size-5.5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  active ? "bg-white/20 text-white" : done ? "bg-primary text-white" : "bg-subtle text-ink-soft"
                }`}
              >
                {done ? <Check className="size-3" strokeWidth={3.5} /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function NewRecommendationWizard() {
  const { locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const presetReport = useSearchParams().get("report") ?? "";

  const [step, setStep] = useState(presetReport ? 1 : 0);
  const [reportId, setReportId] = useState<string>(presetReport);
  const [finding, setFinding] = useState<FindingDraft>(EMPTY_FINDING);
  const [rootCause, setRootCause] = useState("");
  const [risk, setRisk] = useState<"high" | "medium" | "low">("medium");
  const [priority, setPriority] = useState(50);
  const [savedId, setSavedId] = useState<number | null>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", "draft"],
    queryFn: () => api<Paginated<AuditReport>>("/api/reports/?status=draft"),
  });

  const draftReports = reports?.results ?? [];
  const report = draftReports.find((item) => String(item.id) === reportId) ?? null;

  const sections = localizedFindingSections();
  const steps = wizardSteps();

  const text = useMemo(() => composeFinding(finding), [finding]);

  const dirty =
    savedId === null &&
    (rootCause.trim().length > 0 || sections.some((section) => finding[section.id].trim()));
  useUnsavedChanges(dirty);

  const missing: string[] = [];
  if (!reportId) missing.push(T.create.report);
  for (const section of sections) {
    if (section.required && !finding[section.id].trim()) missing.push(section.label);
  }

  const optionalGaps = sections
    .filter((section) => !section.required && !finding[section.id].trim())
    .map((section) => section.label);

  const create = useMutation({
    mutationFn: () =>
      api<{ id: number }>("/api/recommendations/", {
        method: "POST",
        body: {
          report: Number(reportId),
          text,
          root_cause: rootCause,
          risk_level: risk,
          priority_score: priority,
        },
      }),
    onSuccess: (data) => {
      setSavedId(data.id);
      invalidateRecommendationViews(queryClient, { reportId: Number(reportId) });
    },
  });

  const canAdvance = () => {
    if (step === 0) return Boolean(reportId);
    if (step === 1) return Boolean(finding.condition.trim());
    if (step === 2) return true;
    if (step === 3) return Boolean(finding.statement.trim());
    return true;
  };

  const reset = () => {
    setFinding(EMPTY_FINDING);
    setRootCause("");
    setRisk("medium");
    setPriority(50);
    setSavedId(null);
    setStep(1);
  };

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  if (savedId) {
    return (
      <div className="space-y-6 max-w-xl mx-auto">
        <PageHeader title={T.create.title} description={T.create.saved} />
        <Card className="border-s-4 border-s-success p-6">
          <Callout tone="success" icon={<Check className="size-4.5" />} title={T.create.saved}>
            {T.create.saveHint}
          </Callout>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={reset} className="font-bold shadow-md">{T.create.addAnother}</Button>
            <Button variant="secondary" onClick={() => router.push(`/audit/reports/${reportId}`)} className="font-bold shadow-sm ring-1 ring-line">
              {T.create.goToReport}
            </Button>
            <Button variant="ghost" onClick={() => router.push(`/audit/recommendations/${savedId}`)} className="font-bold">
              {T.common.view}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={T.create.title}
        description={T.create.intro}
        breadcrumbs={[
          { label: T.register.title, href: "/audit/recommendations" },
          { label: T.create.title },
        ]}
      />

      <StepRail current={step} onJump={setStep} />

      {/* Step 1 — audit context */}
      {step === 0 ? (
        <Card title={T.create.stepContext} className="p-6">
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">{T.create.contextIntro}</p>

          {isLoading ? (
            <p className="text-sm font-semibold text-ink-soft">{T.common.loading}</p>
          ) : draftReports.length ? (
            <div className="space-y-5">
              <Field label={T.create.report}>
                <Select value={reportId} onChange={(event) => setReportId(event.target.value)} required>
                  <option value="">— {T.common.none} —</option>
                  {draftReports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.department_name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1.5 text-xs text-muted">{T.create.reportHint}</p>
              </Field>

              {report ? (
                <dl className="mt-5 grid gap-4 rounded-xl border border-line bg-subtle/30 p-4.5 sm:grid-cols-2 lg:grid-cols-4">
                  <DataField label={T.response.responsibleParty}><span className="font-bold text-navy">{report.department_name}</span></DataField>
                  <DataField label={T.create.engagement}>
                    <span className="font-semibold text-ink">{REPORT_TYPE_LABELS[report.engagement_type]}</span>
                  </DataField>
                  <DataField label={T.common.targetDate}>
                    <span className="font-mono text-ink-soft" dir="ltr">{formatDate(report.response_deadline)}</span>
                  </DataField>
                  <DataField label={T.create.auditor}>
                    <span className="font-semibold text-ink">{report.created_by_detail?.full_name_ar || report.created_by_detail?.username}</span>
                  </DataField>
                </dl>
              ) : null}

              <Callout tone="neutral" className="mt-5 border-s-4 shadow-sm">
                {T.create.reportDraftOnly}
              </Callout>
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="size-8" />}
              title={T.create.noDraftReports}
              description={T.create.reportHint}
              className="border-dashed shadow-none py-12"
            />
          )}

          {!draftReports.length && !isLoading ? (
            <Link href="/audit/reports/new" className="mt-5 inline-block">
              <Button variant="secondary" className="font-bold ring-1 ring-line shadow-sm">{T.create.createReport}</Button>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {/* Step 2 — the finding */}
      {step === 1 ? (
        <Card title={T.create.stepFinding} className="p-6">
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">{T.create.findingIntro}</p>
          <div className="space-y-5">
            {sections.filter((section) => FINDING_IDS.includes(section.id)).map((section) => (
              <Field key={section.id} label={`${section.label}${section.required ? " *" : ""}`}>
                {section.rows === 1 ? (
                  <TextInput
                    value={finding[section.id]}
                    onChange={(event) => setFinding({ ...finding, [section.id]: event.target.value })}
                    required={section.required}
                  />
                ) : (
                  <TextArea
                    rows={section.rows}
                    value={finding[section.id]}
                    onChange={(event) => setFinding({ ...finding, [section.id]: event.target.value })}
                    required={section.required}
                  />
                )}
                <p className="mt-1.5 text-xs text-muted">{section.hint}</p>
              </Field>
            ))}

            <Field label={T.create.cause}>
              <TextArea
                rows={3}
                value={rootCause}
                onChange={(event) => setRootCause(event.target.value)}
              />
              <p className="mt-1.5 text-xs text-muted">{T.create.causeHint}</p>
            </Field>
          </div>
        </Card>
      ) : null}

      {/* Step 3 — risk and priority */}
      {step === 2 ? (
        <Card title={T.create.stepRisk} className="p-6">
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">{T.create.riskIntro}</p>

          <fieldset className="mb-6">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{T.create.riskLevel}</legend>
            <ChoiceCards
              name="risk-level"
              value={risk}
              onChange={setRisk}
              options={[
                { value: "high", label: RISK_LABELS.high, hint: T.create.riskHighHint },
                { value: "medium", label: RISK_LABELS.medium, hint: T.create.riskMediumHint },
                { value: "low", label: RISK_LABELS.low, hint: T.create.riskLowHint },
              ]}
            />
          </fieldset>

          <Field label={T.create.priorityScore} className="max-w-md bg-subtle/30 rounded-xl p-4.5 border border-line">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="h-2 flex-1 accent-primary bg-line rounded-lg appearance-none cursor-pointer"
                aria-label={T.create.priorityScore}
              />
              <TextInput
                type="number"
                min={0}
                max={100}
                dir="ltr"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="w-20 text-center font-bold font-mono"
              />
            </div>
            <p className="mt-2 text-xs text-muted">{T.create.priorityHint}</p>
          </Field>

          <Callout tone="ai" className="mt-6 border-s-4 shadow-sm">
            {T.create.riskFieldsNote}
          </Callout>
        </Card>
      ) : null}

      {/* Step 4 — the recommendation */}
      {step === 3 ? (
        <Card title={T.create.stepRecommendation} className="p-6">
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">{T.create.recommendationIntro}</p>
          <div className="space-y-5">
            {sections.filter((section) => RECOMMENDATION_IDS.includes(section.id)).map((section) => (
              <Field key={section.id} label={`${section.label}${section.required ? " *" : ""}`}>
                <TextArea
                  rows={section.rows}
                  value={finding[section.id]}
                  onChange={(event) => setFinding({ ...finding, [section.id]: event.target.value })}
                  required={section.required}
                />
                <p className="mt-1.5 text-xs text-muted">{section.hint}</p>
              </Field>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Step 5 — review */}
      {step === 4 ? (
        <div className="space-y-5">
          <Card title={T.create.completeness} className="p-6">
            {missing.length ? (
              <Callout tone="danger" icon={<AlertTriangle className="size-4.5" />} title={T.create.missingFields} className="border-s-4 shadow-sm">
                <ul className="list-disc space-y-1.5 ps-5 text-[13.5px] font-medium">
                  {missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="success" icon={<Check className="size-4.5" />} title={T.create.allComplete} className="border-s-4 shadow-sm">
                {optionalGaps.length ? (
                  <p className="text-[13.5px] font-medium">
                    {T.create.optionalMissing}: {optionalGaps.join(T.common.listSep)}
                  </p>
                ) : null}
              </Callout>
            )}
          </Card>

          <Card title={T.create.stepReview} className="p-6">
            <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">{T.create.reviewIntro}</p>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 bg-subtle/30 rounded-xl p-4 border border-line">
              <DataField label={T.create.report}><span className="font-bold text-navy">{report?.title ?? "—"}</span></DataField>
              <DataField label={T.response.responsibleParty}><span className="font-bold text-navy">{report?.department_name ?? "—"}</span></DataField>
              <DataField label={T.common.targetDate}>
                <span className="font-mono text-ink-soft" dir="ltr">{formatDate(report?.response_deadline)}</span>
              </DataField>
              <DataField label={T.create.riskLevel}><span className="font-bold text-navy">{RISK_LABELS[risk]}</span></DataField>
            </dl>

            <div className="mt-6 space-y-5 border-t border-line pt-6">
              {sections.filter((section) => finding[section.id].trim()).map((section) => (
                <ProseBlock key={section.id} label={section.label} className="bg-surface border border-line/60 rounded-xl p-4 shadow-sm">
                  {finding[section.id]}
                </ProseBlock>
              ))}
              {rootCause.trim() ? <ProseBlock label={T.case.rootCause} className="bg-surface border border-line/60 rounded-xl p-4 shadow-sm">{rootCause}</ProseBlock> : null}
            </div>
          </Card>

          <Card title={T.create.preview} className="p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{T.create.previewHint}</p>
            <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-subtle/30 p-4 font-body text-[13.5px] leading-[1.8] text-ink">
              {text || "—"}
            </pre>
          </Card>

          <ErrorBanner message={create.isError ? errorMessage(create.error) : null} />

          <Callout tone="neutral" className="border-s-4 shadow-sm">{T.create.saveHint}</Callout>
        </div>
      ) : null}

      {/* Navigation */}
      <div className="sticky bottom-0 z-20 -mx-3 flex flex-col gap-2 border-t border-line bg-bg/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:py-5 sm:backdrop-blur-none">
        <Button
          variant="ghost"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
          className="min-h-12 w-full font-bold gap-1 sm:w-auto"
        >
          <DirBack className="size-4" />
          {T.create.back}
        </Button>

        {step < steps.length - 1 ? (
          <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance()} className="min-h-12 w-full font-bold gap-1 shadow-md sm:w-auto">
            {T.create.next}
            <DirForward className="size-4" />
          </Button>
        ) : (
          <Button onClick={() => create.mutate()} disabled={missing.length > 0 || create.isPending} className="min-h-12 w-full font-bold gap-2 shadow-md sm:w-auto">
            <Save className="size-4.5" />
            {T.create.save}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function NewRecommendationPage() {
  useI18n();
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <NewRecommendationWizard />
    </Suspense>
  );
}
