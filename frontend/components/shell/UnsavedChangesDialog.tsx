"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { T, useI18n } from "@/lib/i18n";
import { discardUnsavedChanges, UNSAVED_NAVIGATION } from "@/lib/useUnsavedChanges";

/** Asks before an in-app link leaves a form with unsaved input (BUG-03). */
export function UnsavedChangesDialog() {
  useI18n();
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const onNavigate = (event: Event) => setHref((event as CustomEvent<{ href: string }>).detail.href);
    window.addEventListener(UNSAVED_NAVIGATION, onNavigate);
    return () => window.removeEventListener(UNSAVED_NAVIGATION, onNavigate);
  }, []);
  return (
    <ConfirmDialog
      open={href !== null}
      tone="warn"
      title={T.confirm.unsavedTitle}
      body={T.confirm.unsavedBody}
      confirmLabel={T.confirm.unsavedLeave}
      cancelLabel={T.confirm.unsavedStay}
      onConfirm={() => {
        const target = href;
        setHref(null);
        discardUnsavedChanges();
        if (target) router.push(target);
      }}
      onCancel={() => setHref(null)}
    />
  );
}
