"use client";

import Link from "next/link";

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
      <header className="border-b border-line pb-4">
        <p className="text-[12px] font-semibold text-navy">
          {meta.marker} {meta.label}
        </p>
        {item.recommendation ? (
          <>
            <p className="mt-2 font-mono text-sm text-muted" dir="ltr">
              {recordCode(item.recommendation)}
            </p>
            <h2 className="mt-1 font-heading text-lg font-semibold text-navy">{notificationTitle(item)}</h2>
          </>
        ) : (
          <h2 className="mt-2 font-heading text-lg font-semibold text-navy">{notificationTitle(item)}</h2>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
          {item.department_name ? <span>{item.department_name}</span> : null}
          {stage ? <span>· {stage}</span> : null}
          {item.risk_level ? <RiskBadge level={item.risk_level} /> : null}
        </p>
      </header>

      <dl className="space-y-4 text-sm">
        <div>
          <dt className="text-[11px] font-medium text-muted">{T.notify.whatHappened}</dt>
          <dd className="mt-1 leading-[1.85] text-ink">{item.message}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-muted">{T.notify.when}</dt>
          <dd className="mt-1 font-mono text-ink" dir="ltr">
            {formatDateTime(item.sent_at)}
          </dd>
        </div>
        {item.recommendation ? (
          <div>
            <dt className="text-[11px] font-medium text-muted">{T.notify.related}</dt>
            <dd className="mt-1 text-ink">
              {recordCode(item.recommendation)} — {notificationTitle(item)}
            </dd>
          </div>
        ) : null}
        {stage ? (
          <div>
            <dt className="text-[11px] font-medium text-muted">{T.notify.stage}</dt>
            <dd className="mt-1 text-ink">{stage}</dd>
          </div>
        ) : null}
        {item.target_date ? (
          <div>
            <dt className="text-[11px] font-medium text-muted">{T.notify.deadlineLabel}</dt>
            <dd className="mt-1 text-ink" dir="ltr">
              {formatDate(item.target_date)}
              {overdueLabel ? <span className="ms-2 text-danger-dark">{overdueLabel}</span> : null}
            </dd>
          </div>
        ) : null}
        {item.responsible_employee ? (
          <div>
            <dt className="text-[11px] font-medium text-muted">{T.notify.owner}</dt>
            <dd className="mt-1 text-ink">{item.responsible_employee}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[11px] font-medium text-muted">{T.notify.whyMe}</dt>
          <dd className="mt-1 leading-[1.85] text-ink">{whyItArrived(item)}</dd>
        </div>
        {mustAct && action ? (
          <div>
            <dt className="text-[11px] font-medium text-muted">{T.notify.whatToDo}</dt>
            <dd className="mt-1 font-medium text-navy">{action}</dd>
          </div>
        ) : null}
      </dl>

      <p className="text-[12px] text-muted">{T.notify.noActor}</p>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href={href} onClick={onMarkRead}>
          <Button>{mustAct ? T.notify.takeAction : T.notify.openCase}</Button>
        </Link>
        {!item.is_read && onMarkRead ? (
          <Button variant="ghost" type="button" onClick={onMarkRead}>
            {T.notify.markRead}
          </Button>
        ) : null}
        {onRemove ? (
          <Button variant="ghost" type="button" onClick={onRemove}>
            {T.notify.remove}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
