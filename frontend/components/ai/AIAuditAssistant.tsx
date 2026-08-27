"use client";

import { useMutation } from "@tanstack/react-query";
import { Eraser, Send, Copy, Check, Info } from "lucide-react";
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
  const [showDetailsIndex, setShowDetailsIndex] = useState<number | null>(null);

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
      <div className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.labelKey}
            type="button"
            onClick={() => send(T.ai[chip.messageKey])}
            disabled={ask.isPending}
            className="rounded-full border border-ai/20 bg-surface px-4 py-2 text-[12.5px] font-bold text-ai-dark transition-all duration-200 hover:border-ai/55 hover:bg-ai-light disabled:opacity-40"
          >
            {T.ai[chip.labelKey]}
          </button>
        ))}
      </div>

      <div className="scrollbar-thin mb-4 max-h-[30rem] min-h-[12rem] space-y-4 overflow-y-auto rounded-xl border border-ai/15 bg-surface/50 p-4.5 shadow-inner">
        {visible.length ? (
          visible.map((message, index) => {
            const rtl = isRTL(message.content);
            const metadata = message.metadata || {};
            return (
              <div
                key={`${message.created_at}-${index}`}
                className={cn("flex flex-col w-full", message.role === "user" ? "items-start" : "items-end")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3 text-[13.5px] leading-[1.8] shadow-sm relative group",
                    message.role === "user"
                      ? "bg-subtle text-ink border border-line"
                      : "border border-ai/15 bg-ai-light/40 text-ink"
                  )}
                  dir={rtl ? "rtl" : "ltr"}
                >
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-line/40">
                    <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-muted">
                      {message.role === "user" ? T.ai.you : T.ai.assistant}
                    </p>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyText(message.content, index)}
                        className="text-muted hover:text-navy p-0.5 rounded transition-colors"
                        title="Copy Response"
                      >
                        {copiedIndex === index ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                      </button>
                      {message.role === "assistant" && (metadata.provider || metadata.model) && (
                        <button
                          onClick={() => setShowDetailsIndex(showDetailsIndex === index ? null : index)}
                          className="text-muted hover:text-navy p-0.5 rounded transition-colors"
                          title="Technical Details"
                        >
                          <Info className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap font-medium">{message.content}</p>

                  {/* Technical Info Expansion */}
                  {showDetailsIndex === index && message.role === "assistant" && (
                    <div className="mt-2.5 pt-2 border-t border-line/45 text-[11px] text-muted space-y-0.5 font-mono" dir="ltr">
                      <div>Provider: <span className="font-bold text-navy">{metadata.provider}</span></div>
                      <div>Model: <span className="font-bold text-navy">{metadata.model}</span></div>
                      {metadata.intent && <div>Intent: <span className="font-bold text-navy">{JSON.stringify(metadata.intent)}</span></div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <p className="text-sm font-semibold text-ink-soft">{T.ai.assistantHint}</p>
          </div>
        )}
        {ask.isPending ? (
          <div className="flex justify-end">
            <p className="text-xs font-bold text-ai-dark flex items-center gap-1.5 bg-ai-light/35 px-3 py-1.5 rounded-xl border border-ai/10 animate-pulse">
              <span className="size-2 rounded-full bg-ai animate-ping" />
              {T.ai.generating}
            </p>
          </div>
        ) : null}
      </div>

      <ErrorBanner message={error} />

      <form
        className="space-y-3 pt-3 border-t border-line"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder={T.ai.askPlaceholder}
          className="bg-surface border-line focus:bg-surface focus:border-ai transition-colors"
        />
        <Button type="submit" disabled={ask.isPending || !text.trim()} className="font-bold gap-2 shadow-md">
          <Send className="size-4" />
          {T.ai.ask}
        </Button>
      </form>
    </AIPanel>
  );
}
