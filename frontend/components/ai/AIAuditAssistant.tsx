"use client";

import { useMutation } from "@tanstack/react-query";
import { Eraser, Send } from "lucide-react";
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

export function AIAuditAssistant() {
  useI18n();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AIAssistantResponse["messages"]>([]);

  const ask = useMutation({
    mutationFn: (message: string) =>
      api<AIAssistantResponse>("/api/ai/assistant/", {
        method: "POST",
        body: { message, language: uiLanguage(), conversation_id: conversationId },
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

      <div className="scrollbar-thin mb-4 max-h-[26rem] min-h-[10rem] space-y-4 overflow-y-auto rounded-xl border border-ai/15 bg-surface/50 p-4.5 shadow-inner">
        {visible.length ? (
          visible.map((message, index) => (
            <div
              key={`${message.created_at}-${index}`}
              className={cn("flex", message.role === "user" ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-4 py-3 text-[13.5px] leading-[1.8] shadow-sm",
                  message.role === "user"
                    ? "bg-subtle text-ink border border-line"
                    : "border border-ai/15 bg-ai-light/40 text-ink"
                )}
              >
                <p className="mb-1 font-heading text-[10px] font-bold uppercase tracking-wider text-muted">
                  {message.role === "user" ? T.ai.you : T.ai.assistant}
                </p>
                <p className="whitespace-pre-wrap font-medium">{message.content}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <p className="text-sm font-semibold text-ink-soft">{T.ai.assistantHint}</p>
          </div>
        )}
        {ask.isPending ? (
          <div className="flex justify-end">
            <p className="text-xs font-bold text-ai-dark flex items-center gap-1.5 bg-ai-light/35 px-3 py-1.5 rounded-xl border border-ai/10">
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
