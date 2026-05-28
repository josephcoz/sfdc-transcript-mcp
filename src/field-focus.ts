import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

/**
 * The "focus set" — which Opportunity fields the AI should look for in a
 * transcript. It is a RELEVANCE hint, not a write gate (any updateable field
 * can still be proposed; the human approves every write). The set is the union
 * of an opinionated sales-standard baseline, the org's field-history-tracked
 * fields, and fields the rep explicitly adds — minus anything the rep removes.
 * The rep's additions/removals and per-field "what to look for" notes persist
 * per org under the app-data dir.
 */

/** Fields a rep typically updates after a call. Self-prunes to what's updateable. */
export const BASELINE_FIELDS = [
  "StageName",
  "Amount",
  "CloseDate",
  "NextStep",
  "Description",
  "Type",
  "LeadSource",
  "ForecastCategoryName",
  "Probability",
];

export interface FocusConfig {
  addedFields: string[];
  removedFields: string[];
  notes: Record<string, string>;
}

export interface FocusField {
  name: string;
  inBaseline: boolean;
  fieldHistoryTracked: boolean;
  addedByRep: boolean;
  note?: string;
}

const paths = envPaths("sfdc-transcript-mcp", { suffix: "" });
const EMPTY: FocusConfig = { addedFields: [], removedFields: [], notes: {} };

function focusFile(orgId: string): string {
  const dir = join(paths.data, "opportunity");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, `focus.${orgId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

export function loadFocusConfig(orgId: string): FocusConfig {
  try {
    return { ...EMPTY, ...(JSON.parse(readFileSync(focusFile(orgId), "utf8")) as FocusConfig) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveFocusConfig(orgId: string, cfg: FocusConfig): void {
  writeFileSync(focusFile(orgId), JSON.stringify(cfg, null, 2));
}

/** Merge a rep-initiated add/remove/notes change into a focus config. */
export function applyFocusUpdate(
  cfg: FocusConfig,
  update: { add?: string[]; remove?: string[]; notes?: Record<string, string> },
): FocusConfig {
  const added = new Set(cfg.addedFields);
  const removed = new Set(cfg.removedFields);
  for (const n of update.add ?? []) {
    added.add(n);
    removed.delete(n);
  }
  for (const n of update.remove ?? []) {
    removed.add(n);
    added.delete(n);
  }
  return {
    addedFields: [...added],
    removedFields: [...removed],
    notes: { ...cfg.notes, ...(update.notes ?? {}) },
  };
}

/** Resolve the focus set against what's actually updateable + tracked in the org. */
export function computeFocusSet(
  cfg: FocusConfig,
  updateableNames: Set<string>,
  trackedSet: Set<string>,
): FocusField[] {
  const removed = new Set(cfg.removedFields);
  const names = new Set<string>();
  for (const n of BASELINE_FIELDS) if (updateableNames.has(n)) names.add(n);
  for (const n of trackedSet) if (updateableNames.has(n)) names.add(n);
  for (const n of cfg.addedFields) if (updateableNames.has(n)) names.add(n);
  for (const n of removed) names.delete(n);

  return [...names].map((name) => ({
    name,
    inBaseline: BASELINE_FIELDS.includes(name),
    fieldHistoryTracked: trackedSet.has(name),
    addedByRep: cfg.addedFields.includes(name),
    note: cfg.notes[name],
  }));
}
