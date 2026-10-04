import { describe, expect, it } from "vitest";

import * as ar from "./i18n/ar";
import * as en from "./i18n/en";
import {
  ACTION_RULES,
  ALL_STATUSES,
  ERROR_CODES,
  FIELD_ERROR_CODES,
  STAGE_IDS,
  STATUS_LABELS,
  STATUS_STAGE,
} from "./contract";
import type { CaseActionId, StageId } from "./types";

/**
 * The frontend half of the drift guard. The backend test fails if
 * workflow.json is stale; this one fails if the UI cannot describe something
 * the contract says can happen.
 */
const CATALOGS = { ar: ar.T, en: en.T };

const KNOWN_STAGES: StageId[] = [
  "preparation",
  "response",
  "audit_review",
  "council",
  "plan",
  "execution",
  "head_review",
  "verification",
  "closure",
  "closed",
];

const KNOWN_ACTIONS: CaseActionId[] = [
  "edit_draft",
  "respond",
  "review_response",
  "submit_plan",
  "review_plan",
  "update_progress",
  "upload_evidence",
  "delete_evidence",
  "mark_implemented",
  "review_implementation",
  "verify",
  "submit_for_closure",
  "council_closure",
  "confirm_recurrence",
];

describe("workflow contract coverage", () => {
  it("knows exactly the stages the backend defines", () => {
    expect(STAGE_IDS).toEqual(KNOWN_STAGES);
  });

  it("knows exactly the actions the backend can offer", () => {
    expect(Object.keys(ACTION_RULES).sort()).toEqual([...KNOWN_ACTIONS].sort());
  });

  it("maps every status to a stage and labels it in both languages", () => {
    expect(ALL_STATUSES).toHaveLength(19);
    for (const status of ALL_STATUSES) {
      expect(KNOWN_STAGES).toContain(STATUS_STAGE[status]);
      expect(STATUS_LABELS[status].ar).toBeTruthy();
      expect(STATUS_LABELS[status].en).toBeTruthy();
      expect(ar.STATUS_LABELS[status]).toBe(STATUS_LABELS[status].ar);
      expect(en.STATUS_LABELS[status]).toBe(STATUS_LABELS[status].en);
    }
  });

  for (const [locale, T] of Object.entries(CATALOGS)) {
    it(`${locale}: describes every stage`, () => {
      for (const stage of KNOWN_STAGES) {
        expect(T.workflow.stages[stage], stage).toBeTruthy();
        expect(T.workflow.actors[stage], stage).toBeTruthy();
        expect(T.workflow.questions[stage], stage).toBeTruthy();
      }
    });

    it(`${locale}: says who acts next and what to do for every status`, () => {
      for (const status of ALL_STATUSES) {
        expect(T.workflow.nextRole[status], status).toBeTruthy();
        expect(T.workflow.nextAction[status], status).toBeTruthy();
      }
    });

    it(`${locale}: has a message for every API error code`, () => {
      const missing = ERROR_CODES.filter((code) => !T.apiErrors.codes[code]);
      expect(missing).toEqual([]);
    });

    it(`${locale}: has a message for every field validation code`, () => {
      const missing = FIELD_ERROR_CODES.filter((code) => !T.apiErrors.fieldCodes[code]);
      expect(missing).toEqual([]);
    });
  }
});
