import { describe, it, expect } from "vitest";
import { computeFocusSet, applyFocusUpdate, BASELINE_FIELDS, type FocusConfig } from "../src/field-focus.js";

const empty = (): FocusConfig => ({ addedFields: [], removedFields: [], notes: {} });

const updateable = new Set([
  "StageName", "Amount", "CloseDate", "NextStep", "Description",
  "Type", "LeadSource", "ForecastCategoryName", "Probability",
  "Competitor__c", "OwnerId",
]);

describe("computeFocusSet", () => {
  it("includes the baseline fields that are updateable", () => {
    const names = computeFocusSet(empty(), updateable, new Set()).map((f) => f.name);
    for (const b of BASELINE_FIELDS) expect(names).toContain(b);
  });

  it("includes history-tracked and rep-added fields with their flags/notes", () => {
    const cfg: FocusConfig = {
      addedFields: ["Competitor__c"],
      removedFields: [],
      notes: { Competitor__c: "which vendor they're evaluating" },
    };
    const byName = new Map(computeFocusSet(cfg, updateable, new Set(["OwnerId"])).map((f) => [f.name, f]));
    expect(byName.get("Competitor__c")?.addedByRep).toBe(true);
    expect(byName.get("Competitor__c")?.note).toBe("which vendor they're evaluating");
    expect(byName.get("OwnerId")?.fieldHistoryTracked).toBe(true);
  });

  it("drops removed fields and anything not updateable", () => {
    const cfg: FocusConfig = { addedFields: ["Missing__c"], removedFields: ["Probability"], notes: {} };
    const names = computeFocusSet(cfg, updateable, new Set()).map((f) => f.name);
    expect(names).not.toContain("Probability");
    expect(names).not.toContain("Missing__c");
  });
});

describe("applyFocusUpdate", () => {
  it("treats add and remove as mutually exclusive and re-add un-removes", () => {
    let cfg = applyFocusUpdate(empty(), { add: ["A", "B"], notes: { A: "note a" } });
    expect(cfg.addedFields).toEqual(["A", "B"]);
    expect(cfg.notes.A).toBe("note a");

    cfg = applyFocusUpdate(cfg, { remove: ["A"] });
    expect(cfg.addedFields).toEqual(["B"]);
    expect(cfg.removedFields).toEqual(["A"]);

    cfg = applyFocusUpdate(cfg, { add: ["A"] });
    expect(cfg.removedFields).toEqual([]);
    expect(cfg.addedFields).toContain("A");
  });
});
