"use client";

import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button, TextInput } from "@/components/ui/Base";
import { T, useI18n } from "@/lib/i18n";

export interface SavedView {
  name: string;
  /** The register's query string (without page). */
  query: string;
}

const PREFIX = "raqeeb.register.views.";
const MAX_VIEWS = 12;

/** A personal convenience kept in this browser only; never shared or required. */
export function readViews(scope: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(PREFIX + scope);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedView =>
            typeof item === "object" && item !== null && typeof item.name === "string" && typeof item.query === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function writeViews(scope: string, views: SavedView[]) {
  try {
    window.localStorage.setItem(PREFIX + scope, JSON.stringify(views.slice(0, MAX_VIEWS)));
  } catch {
    /* Storage blocked or full: the views simply are not remembered. */
  }
}

/** Without the page number, so a saved view always opens on page one. */
export function viewQuery(searchParams: URLSearchParams): string {
  const query = new URLSearchParams(searchParams.toString());
  query.delete("page");
  return query.toString();
}

/**
 * Saved filter combinations for one register (per role path). Choosing a view
 * replaces the URL query; saving stores the current one under a name.
 */
export function SavedViews({
  scope,
  currentQuery,
  canSave,
  onApply,
  suggestedName,
}: {
  scope: string;
  currentQuery: string;
  canSave: boolean;
  onApply: (query: string) => void;
  /** Pre-filled name (the queue the list was opened from). */
  suggestedName?: string;
}) {
  useI18n();
  // The register renders on the client only (it suspends on the URL while
  // prerendering), so storage can be read for the first render.
  const [views, setViews] = useState<SavedView[]>(() => (typeof window === "undefined" ? [] : readViews(scope)));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [{ name: trimmed, query: currentQuery }, ...views.filter((view) => view.name !== trimmed)];
    setViews(next);
    writeViews(scope, next);
    setNaming(false);
    setName("");
  };

  const remove = (target: SavedView) => {
    const next = views.filter((view) => view.name !== target.name);
    setViews(next);
    writeViews(scope, next);
  };

  if (!views.length && !canSave) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={T.register.savedViews} role="group">
      {views.length ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
          <Bookmark className="size-3.5" aria-hidden />
          {T.register.savedViews}:
        </span>
      ) : null}
      {views.map((view) => (
        <span
          key={view.name}
          className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface text-[12.5px]"
        >
          <button
            type="button"
            onClick={() => onApply(view.query)}
            aria-pressed={view.query === currentQuery}
            className={
              view.query === currentQuery
                ? "min-h-9 bg-primary px-3 font-bold text-white"
                : "min-h-9 px-3 font-semibold text-ink hover:bg-subtle"
            }
          >
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => remove(view)}
            aria-label={T.register.deleteView.replace("{name}", view.name)}
            className="flex min-h-9 items-center border-s border-line px-2 text-muted hover:bg-danger-light hover:text-danger-dark"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {canSave && !naming ? (
        <button
          type="button"
          onClick={() => {
            setName(suggestedName ?? "");
            setNaming(true);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold text-primary-dark hover:bg-primary-light/50"
        >
          <BookmarkPlus className="size-4" aria-hidden />
          {T.register.saveView}
        </button>
      ) : null}
      {naming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextInput
            autoFocus
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder={T.register.viewName}
            aria-label={T.register.viewName}
            className="min-h-9 w-44 py-1.5"
          />
          <Button type="submit" className="min-h-9 px-3 py-1.5 text-[12.5px]" disabled={!name.trim()}>
            {T.common.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-9 px-3 py-1.5 text-[12.5px]"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
          >
            {T.common.cancel}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
