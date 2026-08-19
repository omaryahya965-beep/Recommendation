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
          <Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
            <Eraser className="size-4" />
            {T.ai.clearChat}
          </Button>
        ) : null
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => (
          <button
            key={chip.labelKey}
            type="button"
            onClick={() => send(T.ai[chip.messageKey])}
            disabled={ask.isPending}
            className="rounded-full border border-ai/25 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ai-dark transition-colors hover:border-ai/50 hover:bg-ai-light disabled:opacity-50"
          >
            {T.ai[chip.labelKey]}
          </button>
        ))}
      </div>

      <div className="scrollbar-thin mb-3 max-h-96 min-h-32 space-y-3 overflow-y-auto rounded-(--radius-field) border border-ai/20 bg-surface p-3">
        {visible.length ? (
          visible.map((message, index) => (
            <div
              key={`${message.created_at}-${index}`}
              className={cn("flex", message.role === "user" ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-(--radius-field) px-3 py-2 text-[13.5px] leading-[1.9]",
                  message.role === "user"
                    ? "bg-subtle text-ink"
                    : "border border-ai/20 bg-ai-light/50 text-ink"
                )}
              >
                <p className="mb-0.5 font-heading text-[11px] font-medium text-muted">
                  {message.role === "user" ? T.ai.you : T.ai.assistant}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-ink-soft">{T.ai.assistantHint}</p>
        )}
        {ask.isPending ? <p className="text-center text-xs text-ai-dark">{T.ai.generating}</p> : null}
      </div>

      <ErrorBanner message={error} />

      <form
        className="space-y-2"
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
        />
        <Button type="submit" disabled={ask.isPending || !text.trim()}>
          <Send className="size-4" />
          {T.ai.ask}
        </Button>
      </form>
    </AIPanel>
  );
}
