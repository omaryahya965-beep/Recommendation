"use client";

import { useEffect, useState } from "react";

import { SESSION_RENEW_FAILED, SESSION_RENEWED } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";

/**
 * One app-wide notice when the session could not be renewed (server busy or
 * offline). The user is still signed in; pages keep their own error states.
 */
export function SessionNotice() {
  useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onFail = () => setFailed(true);
    const onRenew = () => setFailed(false);
    window.addEventListener(SESSION_RENEW_FAILED, onFail);
    window.addEventListener(SESSION_RENEWED, onRenew);
    return () => {
      window.removeEventListener(SESSION_RENEW_FAILED, onFail);
      window.removeEventListener(SESSION_RENEWED, onRenew);
    };
  }, []);
  if (!failed) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[300] flex items-center justify-center gap-3 bg-warning-light px-4 py-2.5 text-center text-[13px] font-semibold text-warning-dark shadow-md print:hidden"
    >
      <span>{T.common.sessionRenewFailed}</span>
      <button
        type="button"
        onClick={() => setFailed(false)}
        className="rounded-md px-2 py-1 font-bold underline-offset-2 hover:underline"
      >
        {T.nav.close}
      </button>
    </div>
  );
}
