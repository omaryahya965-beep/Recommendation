"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Base";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { formatDate, formatDateTime, recordCode } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import {
  currentStageLabel,
  daysOverdueLabel,
  notificationHref,
  notificationTitle,
  notifyMeta,
  requiredAction,
  userMustAct,
  whyItArrived,
} from "@/lib/notifications";
import type { AppNotification, Role } from "@/lib/types";

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-subtle/40 p-3.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{label}</dt>
      <dd className="text-[13.5px] font-medium leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

export function NotificationDetail({
  item,
  role,
  onMarkRead,
  onRemove,
}: {
  item: AppNotification;
  role: Role;
  onMarkRead?: () => void;
  onRemove?: () => void;
}) {
  useI18n();
  const meta = notifyMeta(item.type);
  const action = requiredAction(item, role);
  const mustAct = userMustAct(item, role);
  const href = notificationHref(item, role);
  const stage = currentStageLabel(item);
  const overdueLabel = daysOverdueLabel(item);

  return (
    <aside className="space-y-5">
      {/* Header */}
      <header className="border-b border-line pb-5">
        <p className="text-[11.5px] font-bold uppercase tracking-wider text-ai-dark">
          {meta.marker} {meta.label}
        </p>
        {item.recommendation ? (
          <>
            <p className="mt-2 font-mono text-[13px] font-bold text-muted" dir="ltr">
              {recordCode(item.recommendation)}
            </p>
            <h2 className="mt-1 font-heading text-[18px] font-bold text-navy">{notificationTitle(item)}</h2>
          </>
        ) : (
          <h2 className="mt-2 font-heading text-[18px] font-bold text-navy">{notificationTitle(item)}</h2>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.department_name ? (
            <span className="rounded-full bg-subtle border border-line px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">
              {item.department_name}
            </span>
          ) : null}
          {stage ? (
            <span className="rounded-full bg-subtle border border-line px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">
              {stage}
            </span>
          ) : null}
          {item.risk_level ? <RiskBadge level={item.risk_level} /> : null}
        </div>
      </header>

      {/* Detail fields */}
      <dl className="space-y-3">
        <DetailField label={T.notify.whatHappened}>{item.message}</DetailField>

        <DetailField label={T.notify.when}>
          <span dir="ltr">{formatDateTime(item.sent_at)}</span>
        </DetailField>

        {item.recommendation ? (
          <DetailField label={T.notify.related}>
            {recordCode(item.recommendation)} — {notificationTitle(item)}
          </DetailField>
        ) : null}

        {stage ? <DetailField label={T.notify.stage}>{stage}</DetailField> : null}

        {item.target_date ? (
          <DetailField label={T.notify.deadlineLabel}>
            <span dir="ltr">{formatDate(item.target_date)}</span>
            {overdueLabel ? (
              <span className="ms-2 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger-dark border border-danger/20">
                {overdueLabel}
              </span>
            ) : null}
          </DetailField>
        ) : null}

        {item.responsible_employee ? (
          <DetailField label={T.notify.owner}>{item.responsible_employee}</DetailField>
        ) : null}

        <DetailField label={T.notify.whyMe}>{whyItArrived(item)}</DetailField>

        {mustAct && action ? (
          <div className="rounded-xl border border-navy/15 bg-navy/5 p-4">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-navy mb-1.5">{T.notify.whatToDo}</dt>
            <dd className="text-[14px] font-bold text-navy">{action}</dd>
          </div>
        ) : null}
      </dl>

      <p className="text-[11.5px] font-medium text-muted">{T.notify.noActor}</p>

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5 border-t border-line pt-5">
        <Link href={href} onClick={onMarkRead}>
          <Button className="gap-2 font-bold shadow-sm">
            <ArrowUpRight className="size-4" />
            {mustAct ? T.notify.takeAction : T.notify.openCase}
          </Button>
        </Link>
        {!item.is_read && onMarkRead ? (
          <Button variant="secondary" type="button" onClick={onMarkRead} className="gap-2 font-bold">
            <Eye className="size-4" />
            {T.notify.markRead}
          </Button>
        ) : null}
        {onRemove ? (
          <Button variant="ghost" type="button" onClick={onRemove} className="gap-2 font-bold text-danger-dark hover:bg-danger/10">
            <Trash2 className="size-4" />
            {T.notify.remove}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
