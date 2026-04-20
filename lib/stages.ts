// Stage registry for the staleness banner + AI-disabled empty state.
//
// The pipeline currently has five surfaced stages: Extract, Native classify,
// AI classify, Diagnose (AI), Calendar (AI). Only two of them back a dashboard
// page (Diagnose → /strategy, Calendar → /plan); the others run silently.
// The banner's expanded detail panel lists ALL stages so the reader can see
// where a cascade of fallbacks started. The empty state (AI-disabled) and
// copy helpers only need the two page-backing stages.
//
// Why this exists as a registry rather than inline strings:
//  1) The env-var names appear in banner copy, the empty state copy, and
//     (eventually) the provider-switching doc. Typos here silently make the
//     reader look in the wrong place. Single source of truth.
//  2) When Step 2 adds CLASSIFY_PROVIDER / CLASSIFY_MODEL / CLASSIFY_API_KEY,
//     adding a new entry here is the only code change needed — the banner
//     picks it up automatically.

import type { ArtifactStatus, RunStatus } from "./sheets";

export type StageId = "extract" | "native_classify" | "ai_classify" | "diagnosis" | "calendar";

export interface StageDef {
  id: StageId;
  /** Short display label used in the banner's expanded detail panel. */
  label: string;
  /** Noun used in page-level copy. "AI diagnosis is off this run." */
  noun: string;
  /** Is this stage AI-backed (credits / provider required to run)? */
  aiBacked: boolean;
  /**
   * The three env-var names that control this stage's provider. Empty for
   * stages that don't call AI (extract, native_classify). Displayed as
   * inline code chips in the empty state copy.
   */
  envVars: readonly string[];
  /**
   * Which dashboard page(s) surface this stage's artifact. Used by the empty
   * state — only stages that back a page can render an AIDisabledEmptyState.
   */
  pages: readonly string[];
  /**
   * How to read this stage's run-status fields off `RunStatus`. Null for
   * stages that aren't individually tracked yet (pipeline predates their
   * Analysis_Log column). Banner treats null as "unknown / don't include".
   */
  readStatus: ((run: RunStatus) => ArtifactStatus) | null;
  readLastSuccessful: ((run: RunStatus) => string) | null;
}

export const STAGES: Record<StageId, StageDef> = {
  extract: {
    id: "extract",
    label: "Extract",
    noun: "Meta scrape",
    aiBacked: false,
    envVars: [],
    pages: [],
    // Extract success is implied by the run existing at all. When Analysis_Log
    // gains a dedicated Extract Status column, switch this over. For now the
    // banner hides this row unless the overall run failed.
    readStatus: null,
    readLastSuccessful: null,
  },
  native_classify: {
    id: "native_classify",
    label: "Native classify",
    noun: "native classification",
    aiBacked: false,
    envVars: [],
    pages: [],
    readStatus: null,
    readLastSuccessful: null,
  },
  ai_classify: {
    id: "ai_classify",
    label: "AI classify",
    noun: "AI classification",
    aiBacked: true,
    envVars: ["CLASSIFY_PROVIDER", "CLASSIFY_MODEL", "CLASSIFY_API_KEY"],
    pages: [],
    readStatus: (r) => r.classify_status,
    // Classify doesn't yet carry forward a "Last Successful" timestamp in
    // Analysis_Log — the pipeline writes it per-run. Fall back to last_run_at
    // when the most recent classify was a success; otherwise "".
    readLastSuccessful: (r) => (r.classify_status === "success" ? r.last_run_at : ""),
  },
  diagnosis: {
    id: "diagnosis",
    label: "Diagnose (AI)",
    noun: "AI diagnosis",
    aiBacked: true,
    envVars: ["DIAGNOSIS_PROVIDER", "DIAGNOSIS_MODEL", "DIAGNOSIS_API_KEY"],
    pages: ["/strategy"],
    readStatus: (r) => r.diagnosis_status,
    readLastSuccessful: (r) => r.last_successful_diagnosis_at,
  },
  calendar: {
    id: "calendar",
    label: "Calendar (AI)",
    noun: "AI calendar",
    aiBacked: true,
    envVars: ["CALENDAR_PROVIDER", "CALENDAR_MODEL", "CALENDAR_API_KEY"],
    pages: ["/plan"],
    readStatus: (r) => r.calendar_status,
    readLastSuccessful: (r) => r.last_successful_calendar_at,
  },
};

/** Ordered list of stages as they should appear in the banner's detail panel. */
export const STAGE_ORDER: StageId[] = [
  "extract",
  "native_classify",
  "ai_classify",
  "diagnosis",
  "calendar",
];

/** The two stages that back a dashboard page. Used by the empty state. */
export function stageForPage(path: string): StageDef | null {
  for (const id of STAGE_ORDER) {
    if (STAGES[id].pages.includes(path)) return STAGES[id];
  }
  return null;
}
