import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateUpdates } from "../src/extract/validate.js";
import type { FieldMeta } from "../src/sf/describe.js";
import type { ProposedUpdate } from "../src/extract/schema.js";

const fields = JSON.parse(
  readFileSync(new URL("fixtures/describe-opportunity.json", import.meta.url), "utf8"),
) as FieldMeta[];

const allowed = ["StageName", "Amount", "CloseDate", "NextStep", "Description"];
const current: Record<string, unknown> = {
  StageName: "Qualification",
  Amount: null,
  CloseDate: "2026-09-30",
  NextStep: null,
  Description: null,
};

function upd(field: string, value: string | number | boolean): ProposedUpdate {
  return { field, value, sourceSpan: { speaker: "Others", quote: "..." } };
}

describe("validateUpdates", () => {
  it("rejects fields not in the allow-list", () => {
    const r = validateUpdates([upd("OwnerId", "005000000000001AAA")], fields, allowed, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/allow-list/);
  });

  it("rejects non-updateable fields even when allow-listed", () => {
    const r = validateUpdates(
      [upd("CreatedDate", "2026-01-01T00:00:00Z")],
      fields,
      [...allowed, "CreatedDate"],
      current,
    );
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/not updateable/);
  });

  it("rejects over-length strings without truncating", () => {
    const r = validateUpdates([upd("NextStep", "x".repeat(300))], fields, allowed, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/exceeds max length 255/);
  });

  it("rejects unknown picklist values", () => {
    const r = validateUpdates([upd("StageName", "Totally Made Up")], fields, allowed, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/not an active picklist value/);
  });

  it("normalizes picklist case and reports it", () => {
    const r = validateUpdates([upd("StageName", "proposal/price quote")], fields, allowed, current);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid[0].to).toBe("Proposal/Price Quote");
    expect(r.valid[0].from).toBe("Qualification");
    expect(r.valid[0].normalizedNote).toBeDefined();
  });

  it("coerces numeric strings (with currency symbols) to numbers", () => {
    const r = validateUpdates([upd("Amount", "$85,000")], fields, allowed, current);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid[0].to).toBe(85000);
  });

  it("accepts a valid ISO date and rejects a non-ISO one", () => {
    const ok = validateUpdates([upd("CloseDate", "2026-06-30")], fields, allowed, current);
    expect(ok.valid[0].to).toBe("2026-06-30");

    const bad = validateUpdates([upd("CloseDate", "June 30, 2026")], fields, allowed, current);
    expect(bad.valid).toHaveLength(0);
    expect(bad.rejected[0].reason).toMatch(/YYYY-MM-DD/);
  });

  it("rejects everything when no allow-list is configured", () => {
    const r = validateUpdates([upd("Amount", 1000)], fields, null, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/no allow-list/);
  });
});
