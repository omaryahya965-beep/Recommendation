/**
 * API error codes → the user's language.
 *
 * Every API error carries a stable `code` (backend apps/core/error_codes.py)
 * and sometimes `params`. The server's English `detail` is for logs and API
 * clients; an Arabic screen never shows it.
 */
import { currentT } from "./i18n/messages";
import { getLocale } from "./i18n/store";
import type { ActionBlocker } from "./types";

export interface ApiErrorBody {
  code?: unknown;
  detail?: unknown;
  params?: Record<string, unknown>;
  field_codes?: Record<string, unknown>;
  [field: string]: unknown;
}

export function interpolate(template: string, params?: Record<string, unknown>): string {
  const T = currentT();
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params?.[key];
    if (Array.isArray(value)) return value.join(T.common.listSep);
    return value === undefined || value === null ? "" : String(value);
  });
}

/** The translated message for an error code, or null when it is unknown. */
export function messageForCode(code: string, params?: Record<string, unknown>): string | null {
  const template = currentT().apiErrors.codes[code];
  return template ? interpolate(template, params) : null;
}

/** Why an offered action is not available yet. */
export function describeBlocker(blocker: ActionBlocker): string {
  return messageForCode(blocker.code, blocker.params) ?? currentT().apiErrors.generic;
}

function firstCode(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = firstCode(item);
      if (code) return code;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const code = firstCode(item);
      if (code) return code;
    }
  }
  return null;
}

function firstText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstText).find(Boolean) ?? null;
  return null;
}

/** "Field: message" for each field of a validation error, in the UI language. */
export function validationMessage(body: ApiErrorBody): string {
  const T = currentT();
  const english = getLocale() === "en";
  const parts: string[] = [];
  for (const [field, codes] of Object.entries(body.field_codes ?? {})) {
    const code = firstCode(codes);
    const message =
      (code && (messageForCode(code) ?? T.apiErrors.fieldCodes[code])) ||
      (english ? firstText(body[field]) : null) ||
      T.apiErrors.fieldCodes.invalid;
    const label =
      field === "non_field_errors" ? "" : (T.apiErrors.fields[field] ?? (english ? field : ""));
    parts.push(label ? `${label}: ${message}` : message);
  }
  return parts.join(" — ") || T.apiErrors.codes.validation_error;
}

/** The message to show for a failed API call with this body and status. */
export function messageFromErrorBody(body: ApiErrorBody | null, status: number): string {
  const T = currentT();
  if (body && typeof body === "object") {
    if (body.code === "validation_error" && body.field_codes) return validationMessage(body);
    if (typeof body.code === "string") {
      const message = messageForCode(body.code, body.params);
      if (message) return message;
    }
    // An unknown code or an older payload: English may show the server text,
    // Arabic never does.
    if (getLocale() === "en") {
      if (typeof body.detail === "string") return body.detail;
      const parts: string[] = [];
      for (const [key, value] of Object.entries(body)) {
        const text = firstText(value);
        if (text && key !== "code" && key !== "field_codes") parts.push(`${key}: ${text}`);
      }
      if (parts.length) return parts.join(" — ");
    }
  }
  return T.apiErrors.genericStatus.replace("{status}", String(status));
}
