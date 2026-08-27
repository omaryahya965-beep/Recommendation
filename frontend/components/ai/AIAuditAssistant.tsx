"use client";

import { useMutation } from "@tanstack/react-query";
import { Eraser, Send, Copy, Check } from "lucide-react";
import { useState } from "react";

import { Button, ErrorBanner, TextArea } from "@/components/ui/Base";
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

export function AIAuditAssistant() {
  useI18n();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AIAssistantResponse["messages"]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
    onSuccess: (data) => {
      setError(null);
      setConversationId(data.conversation_id);
      setHistory(data.messages);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const clear = useMutation({
    mutationFn: () => api("/api/ai/assistant/conversations/", { method: "DELETE" }),
    onSuccess: () => {
      setConversationId(undefined);
      setHistory([]);
    },
  });

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    ask.mutate(trimmed);
    setText("");
  };

  const copyText = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const visible = history.filter((message) => message.role !== "system");

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
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
        {CHIPS.map((chip) => (
          <button
            key={chip.labelKey}
            type="button"
            onClick={() => send(T.ai[chip.messageKey])}
            disabled={ask.isPending}
            className="min-h-11 shrink-0 rounded-full border border-ai/20 bg-surface px-4 text-[13px] font-bold text-ai-dark disabled:opacity-40"
          >
            {T.ai[chip.labelKey]}
          </button>
        ))}
      </div>

      <div className="scrollbar-thin mb-4 max-h-[min(28rem,55dvh)] min-h-[12rem] space-y-4 overflow-y-auto rounded-xl border border-ai/15 bg-surface/50 p-3 shadow-inner md:p-4.5">
        {visible.length ? (
          visible.map((message, index) => {
            const rtl = isRTL(message.content);
            const metadata = message.metadata || {};
            const provider = typeof metadata.provider === "string" ? metadata.provider : "";
            const fallback = !provider || /local|fallback|heuristic/i.test(provider);
            return (
              <div
                key={`${message.created_at}-${index}`}
                className={cn("flex w-full min-w-0 flex-col", message.role === "user" ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[92%] min-w-0 rounded-xl px-4 py-3 text-[15px] leading-[1.8] shadow-sm md:max-w-[85%] md:text-[13.5px]",
                    message.role === "user"
                      ? "border border-line bg-subtle text-ink"
                      : "border border-ai/15 bg-ai-light/40 text-ink"
                  )}
                  dir={rtl ? "rtl" : "ltr"}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 border-b border-line/40 pb-1">
                    <p className="font-heading text-[12px] font-bold text-muted">
                      {message.role === "user" ? T.ai.you : T.ai.assistant}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyText(message.content, index)}
                        className="flex size-11 items-center justify-center rounded-lg text-muted md:size-8"
                        aria-label={T.common.view}
                      >
                        {copiedIndex === index ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap font-medium">{message.content}</p>
                  {message.role === "assistant" ? (
                    <p className="mt-2 text-[12px] font-semibold leading-relaxed text-muted">
                      {fallback ? T.ai.unavailable : provider}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <p className="text-[15px] font-semibold text-ink-soft">{T.ai.assistantHint}</p>
          </div>
        )}
        {ask.isPending ? (
          <div className="flex justify-start">
            <p className="flex items-center gap-1.5 rounded-xl border border-ai/10 bg-ai-light/35 px-3 py-1.5 text-[13px] font-bold text-ai-dark">
              <span className="size-2 rounded-full bg-ai animate-pulse" />
              {T.ai.generating}
            </p>
          </div>
        ) : null}
      </div>

      <ErrorBanner message={error} />

      <form
        className="sticky bottom-0 space-y-3 border-t border-line bg-ai-light/10 pt-3 pb-[env(safe-area-inset-bottom)]"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder={T.ai.askPlaceholder}
          className="bg-surface border-line focus:bg-surface focus:border-ai transition-colors"
        />
        <Button type="submit" disabled={ask.isPending || !text.trim()} className="min-h-12 w-full font-bold gap-2 shadow-md">
          <Send className="size-4" />
          {T.ai.ask}
        </Button>
      </form>
    </AIPanel>
  );
}
