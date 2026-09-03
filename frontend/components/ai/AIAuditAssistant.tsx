"use client";

import { useMutation } from "@tanstack/react-query";
import { Eraser, Send, Copy, Check, Sparkles, Info } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { AIAssistantResponse } from "@/lib/types";

import { AIPanel } from "./AIPrimitives";

const CHIPS = [
  { labelKey: "chipsOverdue" as const, messageKey: "chipsOverdue" as const },
  { labelKey: "chipsHighRisk" as const, messageKey: "chipsHighRisk" as const },
  { labelKey: "chipsRecurring" as const, messageKey: "chipsRecurring" as const },
  { labelKey: "chipsDeadlines" as const, messageKey: "chipsDeadlines" as const },
  { labelKey: "chipsVerification" as const, messageKey: "chipsVerification" as const },
  { labelKey: "chipsDepartments" as const, messageKey: "chipsDepartments" as const },
  { labelKey: "chipsInsufficient" as const, messageKey: "chipsInsufficient" as const },
];

function isRTL(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

/** Auto-grow a textarea to its content, clamped between min and max heights. */
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "0px";
  const scrollH = el.scrollHeight;
  const minPx = 80;  // 5rem
  const maxPx = 192; // 12rem
  el.style.height = `${Math.min(Math.max(scrollH, minPx), maxPx)}px`;
}

export function AIAuditAssistant() {
  useI18n();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AIAssistantResponse["messages"]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract page context parameters from the URL query
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const recommendationId = searchParams?.get("recommendation_id") ? parseInt(searchParams.get("recommendation_id")!) : undefined;
  const reportId = searchParams?.get("report_id") ? parseInt(searchParams.get("report_id")!) : undefined;
  const departmentId = searchParams?.get("department_id") ? parseInt(searchParams.get("department_id")!) : undefined;

  const ask = useMutation({
    mutationFn: (message: string) =>
      api<AIAssistantResponse>("/api/ai/assistant/", {
        method: "POST",
        body: {
          message,
          language: uiLanguage(),
          conversation_id: conversationId,
          recommendation_id: recommendationId,
          report_id: reportId,
          department_id: departmentId,
          route: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      }),
    onSuccess: (data, message) => {
      setPendingPreview(null);
      setError(null);
      setConversationId(data.conversation_id);
      setHistory(data.messages);
      setText((current) => (current.trim() === message.trim() ? "" : current));
    },
    onError: (err) => {
      setPendingPreview(null);
      setError(errorMessage(err));
    },
  });

  const clear = useMutation({
    mutationFn: () => api("/api/ai/assistant/conversations/", { method: "DELETE" }),
    onSuccess: () => {
      setPendingPreview(null);
      setConversationId(undefined);
      setHistory([]);
    },
  });

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setPendingPreview(trimmed);
    ask.mutate(trimmed);
  };

  const visible = history.filter((message) => message.role !== "system");
  const lastVisible = visible[visible.length - 1];
  const showPendingUser =
    Boolean(pendingPreview) &&
    !(lastVisible?.role === "user" && lastVisible.content === pendingPreview);

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const snapToBottom = () => {
      root.scrollTop = root.scrollHeight;
    };
    snapToBottom();
    const frame = requestAnimationFrame(snapToBottom);
    return () => cancelAnimationFrame(frame);
  }, [visible.length, pendingPreview, ask.isPending, history]);

  const copyText = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <AIPanel
      title={T.ai.assistant}
      actions={
        visible.length ? (
          <Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending} className="font-bold gap-1 text-xs">
            <Eraser className="size-4" />
            {T.ai.clearChat}
          </Button>
        ) : null
      }
    >
      {/* ── Quick-suggestion chips ─────────────────────────────────── */}
      <div
        className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2 scrollbar-thin"
      >
        {CHIPS.map((chip) => (
          <button
            key={chip.labelKey}
            type="button"
            onClick={() => send(T.ai[chip.messageKey])}
            disabled={ask.isPending}
            className={cn(
              "min-h-10 shrink-0 rounded-full border border-ai/30 bg-ai-light",
              "px-4 text-[13px] font-bold text-ai-dark",
              "transition-colors duration-150 hover:bg-ai/15",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {T.ai[chip.labelKey]}
          </button>
        ))}
      </div>

      {/* ── Message scroll area ────────────────────────────────────── */}
      <div
        ref={scrollerRef}
        className="scrollbar-thin mb-4 max-h-[min(28rem,55dvh)] min-h-[12rem] space-y-5 overflow-y-auto rounded-xl border border-ai/15 bg-surface/50 p-3 shadow-inner md:p-4"
      >
        {/* Empty state */}
        {visible.length === 0 && !showPendingUser && (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <Sparkles className="mb-3 size-7 text-ai-dark/40" aria-hidden />
            <p className="text-[15px] font-semibold text-ai-dark/60">{T.ai.assistantHint}</p>
          </div>
        )}

        {/* Conversation history */}
        {visible.map((message, index) => {
          const rtl = isRTL(message.content);
          const metadata = message.metadata || {};
          const provider = typeof metadata.provider === "string" ? metadata.provider : "";
          const fallback = !provider || /local|fallback|heuristic/i.test(provider);

          if (message.role === "user") {
            return (
              <div key={`${message.created_at}-${index}`} className="flex w-full flex-col items-end gap-1">
                {/* Caption above bubble */}
                <span className="pe-1 text-[11px] font-bold text-muted">{T.ai.you}</span>
                {/* Bubble */}
                <div
                  className={cn(
                    "relative max-w-[92%] min-w-0 rounded-xl border border-line bg-white",
                    "px-4 py-3 text-[15px] leading-[1.8] shadow-sm md:max-w-[78%] md:text-[13.5px]",
                  )}
                  dir={rtl ? "rtl" : "ltr"}
                >
                  {/* Copy button — top-right inside bubble */}
                  <button
                    type="button"
                    onClick={() => copyText(message.content, index)}
                    className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink"
                    aria-label={T.common.view}
                  >
                    {copiedIndex === index ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                  <p className="whitespace-pre-wrap font-medium pe-6">{message.content}</p>
                </div>
              </div>
            );
          }

          // Assistant message
          return (
            <div key={`${message.created_at}-${index}`} className="flex w-full flex-col items-start gap-1">
              {/* Caption above bubble */}
              <span className="ps-1 inline-flex items-center gap-1 text-[11px] font-bold text-ai-dark/70">
                <Sparkles className="size-3 text-ai" aria-hidden />
                {T.ai.assistant}
              </span>
              {/* Bubble */}
              <div
                className={cn(
                  "relative w-full min-w-0 rounded-xl border border-ai/20 bg-ai-light/50",
                  "px-4 py-3 text-[15px] leading-[1.8] shadow-sm md:text-[13.5px]",
                )}
                dir={rtl ? "rtl" : "ltr"}
              >
                {/* Copy button — top-end inside bubble */}
                <button
                  type="button"
                  onClick={() => copyText(message.content, index)}
                  className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-ai-light hover:text-ai-dark"
                  aria-label={T.common.view}
                >
                  {copiedIndex === index ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <p className="whitespace-pre-wrap font-medium pe-6">{message.content}</p>
              </div>

              {/* Provider / fallback note — outside & below the bubble */}
              <div className="w-full border-t border-line/40 pt-1.5 ps-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold italic text-muted">
                  <Info className="size-3 shrink-0 not-italic" aria-hidden />
                  {fallback ? T.ai.unavailable : provider}
                </p>
              </div>
            </div>
          );
        })}

        {/* Pending user preview */}
        {showPendingUser && pendingPreview ? (
          <div className="flex w-full flex-col items-end gap-1">
            <span className="pe-1 text-[11px] font-bold text-muted">{T.ai.you}</span>
            <div
              className="max-w-[92%] min-w-0 rounded-xl border border-line bg-white px-4 py-3 text-[15px] leading-[1.8] text-ink shadow-sm md:max-w-[78%] md:text-[13.5px]"
              dir={isRTL(pendingPreview) ? "rtl" : "ltr"}
            >
              <p className="whitespace-pre-wrap font-medium">{pendingPreview}</p>
            </div>
          </div>
        ) : null}

        {/* Three-dot typing indicator */}
        {ask.isPending ? (
          <div className="flex justify-start" role="status" aria-label={T.ai.generating}>
            <div className="flex items-center gap-1.5 rounded-full border border-ai/20 bg-ai-light/50 px-4 py-3">
              <span
                className="size-2 rounded-full bg-ai animate-bounce"
                style={{ animationDelay: "0ms" }}
                aria-hidden
              />
              <span
                className="size-2 rounded-full bg-ai animate-bounce"
                style={{ animationDelay: "150ms" }}
                aria-hidden
              />
              <span
                className="size-2 rounded-full bg-ai animate-bounce"
                style={{ animationDelay: "300ms" }}
                aria-hidden
              />
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      <ErrorBanner message={error} />

      {/* ── Composite input bar ────────────────────────────────────── */}
      <form
        className="sticky bottom-0 border-t border-ai/10 bg-transparent pt-3 pb-[env(safe-area-inset-bottom)]"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        {/* Wrapper: textarea + send button inset */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            rows={2}
            placeholder={T.ai.askPlaceholder}
            disabled={ask.isPending}
            style={{ textAlign: "start", minHeight: "5rem", maxHeight: "12rem" }}
            className={cn(
              "w-full resize-none rounded-xl border border-line bg-surface",
              "px-4 py-3 pe-14 text-base md:text-[14px] text-ink",
              "outline-none transition-all duration-200",
              "hover:border-muted/40 focus:border-ai focus:ring-4 focus:ring-ai/10",
              "scrollbar-thin placeholder:text-muted",
              "disabled:opacity-60",
            )}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter submits
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send(text);
              }
            }}
          />

          {/* Circular send button — inset bottom-end */}
          <button
            type="submit"
            disabled={ask.isPending || !text.trim()}
            aria-label={T.ai.ask}
            className={cn(
              "absolute bottom-3 end-3",
              "flex size-9 items-center justify-center rounded-full",
              "bg-primary text-white shadow-sm",
              "transition-all duration-200 hover:bg-primary-dark hover:shadow-md active:scale-95",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </AIPanel>
  );
}
