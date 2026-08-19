"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileText, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { DirBack, DirForward } from "@/components/i18n/DirIcon";

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
import {
  composeFinding,
  EMPTY_FINDING,
  localizedFindingSections,
  type FindingDraft,
  type FindingSectionId,
} from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { ENGAGEMENT_LABELS, RISK_LABELS, T, useI18n } from "@/lib/i18n";
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
    <ol className="scrollbar-thin flex gap-1 overflow-x-auto rounded-(--radius-card) border border-line bg-surface p-2">
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
              className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-start text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "bg-primary text-white"
                  : done
                    ? "bg-primary-light text-primary-dark hover:bg-primary-light/70"
                    : "text-ink-soft"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                  active ? "bg-white/20" : done ? "bg-primary text-white" : "bg-subtle"
                }`}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
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
  useI18n();
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
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report", Number(reportId)] });
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

  if (savedId) {
    return (
      <div className="space-y-5">
        <PageHeader title={T.create.title} description={T.create.saved} />
        <Card>
          <Callout tone="success" icon={<Check className="size-4" />} title={T.create.saved}>
            {T.create.saveHint}
          </Callout>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={reset}>{T.create.addAnother}</Button>
            <Button variant="secondary" onClick={() => router.push(`/audit/reports/${reportId}`)}>
              {T.create.goToReport}
            </Button>
            <Button variant="ghost" onClick={() => router.push(`/audit/recommendations/${savedId}`)}>
              {T.common.view}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
        <Card title={T.create.stepContext}>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{T.create.contextIntro}</p>

          {isLoading ? (
            <p className="text-sm text-ink-soft">{T.common.loading}</p>
          ) : draftReports.length ? (
            <>
              <Field label={T.create.report}>
                <Select value={reportId} onChange={(event) => setReportId(event.target.value)} required>
                  <option value="">— {T.common.none} —</option>
                  {draftReports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.department_name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted">{T.create.reportHint}</p>
              </Field>

              {report ? (
                <dl className="mt-4 grid gap-4 rounded-(--radius-field) border border-line bg-subtle/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <DataField label={T.response.responsibleParty}>{report.department_name}</DataField>
                  <DataField label={T.create.engagement}>
                    {ENGAGEMENT_LABELS[report.engagement_type]}
                  </DataField>
                  <DataField label={T.common.targetDate}>
                    <span dir="ltr">{formatDate(report.response_deadline)}</span>
                  </DataField>
                  <DataField label={T.create.auditor}>
                    {report.created_by_detail?.full_name_ar || report.created_by_detail?.username}
                  </DataField>
                </dl>
              ) : null}

              <Callout tone="neutral" className="mt-4">
                {T.create.reportDraftOnly}
              </Callout>
            </>
          ) : (
            <EmptyState
              icon={<FileText className="size-6" />}
              title={T.create.noDraftReports}
              description={T.create.reportHint}
              className="border-dashed shadow-none"
            />
          )}

          {!draftReports.length && !isLoading ? (
            <Link href="/audit/reports/new" className="mt-4 inline-block">
              <Button variant="secondary">{T.create.createReport}</Button>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {/* Step 2 — the finding */}
      {step === 1 ? (
        <Card title={T.create.stepFinding}>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{T.create.findingIntro}</p>
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
                <p className="mt-1 text-xs text-muted">{section.hint}</p>
              </Field>
            ))}

            <Field label={T.create.cause}>
              <TextArea
                rows={3}
                value={rootCause}
                onChange={(event) => setRootCause(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted">{T.create.causeHint}</p>
            </Field>
          </div>
        </Card>
      ) : null}

      {/* Step 3 — risk and priority */}
      {step === 2 ? (
        <Card title={T.create.stepRisk}>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{T.create.riskIntro}</p>

          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-medium text-ink">{T.create.riskLevel}</legend>
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

          <Field label={T.create.priorityScore} className="max-w-md">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="h-1.5 flex-1 accent-primary"
                aria-label={T.create.priorityScore}
              />
              <TextInput
                type="number"
                min={0}
                max={100}
                dir="ltr"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="w-20 text-center"
              />
            </div>
            <p className="mt-1 text-xs text-muted">{T.create.priorityHint}</p>
          </Field>

          <Callout tone="ai" className="mt-5">
            {T.create.riskFieldsNote}
          </Callout>
        </Card>
      ) : null}

      {/* Step 4 — the recommendation */}
      {step === 3 ? (
        <Card title={T.create.stepRecommendation}>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{T.create.recommendationIntro}</p>
          <div className="space-y-5">
            {sections.filter((section) => RECOMMENDATION_IDS.includes(section.id)).map((section) => (
              <Field key={section.id} label={`${section.label}${section.required ? " *" : ""}`}>
                <TextArea
                  rows={section.rows}
                  value={finding[section.id]}
                  onChange={(event) => setFinding({ ...finding, [section.id]: event.target.value })}
                  required={section.required}
                />
                <p className="mt-1 text-xs text-muted">{section.hint}</p>
              </Field>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Step 5 — review */}
      {step === 4 ? (
        <div className="space-y-4">
          <Card title={T.create.completeness}>
            {missing.length ? (
              <Callout tone="danger" icon={<AlertTriangle className="size-4" />} title={T.create.missingFields}>
                <ul className="list-disc space-y-0.5 ps-5">
                  {missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="success" icon={<Check className="size-4" />} title={T.create.allComplete}>
                {optionalGaps.length ? (
                  <p>
                    {T.create.optionalMissing}: {optionalGaps.join(T.common.listSep)}
                  </p>
                ) : null}
              </Callout>
            )}
          </Card>

          <Card title={T.create.stepReview}>
            <p className="mb-4 text-sm leading-relaxed text-ink-soft">{T.create.reviewIntro}</p>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DataField label={T.create.report}>{report?.title ?? "—"}</DataField>
              <DataField label={T.response.responsibleParty}>{report?.department_name ?? "—"}</DataField>
              <DataField label={T.common.targetDate}>
                <span dir="ltr">{formatDate(report?.response_deadline)}</span>
              </DataField>
              <DataField label={T.create.riskLevel}>{RISK_LABELS[risk]}</DataField>
            </dl>

            <div className="mt-5 space-y-4 border-t border-line pt-5">
              {sections.filter((section) => finding[section.id].trim()).map((section) => (
                <ProseBlock key={section.id} label={section.label}>
                  {finding[section.id]}
                </ProseBlock>
              ))}
              {rootCause.trim() ? <ProseBlock label={T.case.rootCause}>{rootCause}</ProseBlock> : null}
            </div>
          </Card>

          <Card title={T.create.preview}>
            <p className="mb-2 text-xs text-muted">{T.create.previewHint}</p>
            <pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-(--radius-field) border border-line bg-subtle/50 p-3 font-body text-[13px] leading-[1.9] text-ink">
              {text || "—"}
            </pre>
          </Card>

          <ErrorBanner message={create.isError ? errorMessage(create.error) : null} />

          <Callout tone="neutral">{T.create.saveHint}</Callout>
        </div>
      ) : null}

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
        >
          <DirBack className="size-4" />
          {T.create.back}
        </Button>

        {step < steps.length - 1 ? (
          <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance()}>
            {T.create.next}
            <DirForward className="size-4" />
          </Button>
        ) : (
          <Button onClick={() => create.mutate()} disabled={missing.length > 0 || create.isPending}>
            <Save className="size-4" />
            {T.create.save}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function NewRecommendationPage() {
  useI18n();
  // useSearchParams needs a suspense boundary so the shell can still prerender.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <NewRecommendationWizard />
    </Suspense>
  );
}
