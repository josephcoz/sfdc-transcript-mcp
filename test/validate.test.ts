import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateUpdates } from "../src/extract/validate.js";
import type { FieldMeta } from "../src/sf/describe.js";
import type { ProposedUpdate } from "../src/extract/schema.js";

const fields = JSON.parse(
  readFileSync(new URL("fixtures/describe-opportunity.json", import.meta.url), "utf8"),
) as FieldMeta[];

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
  it("rejects unknown fields", () => {
    const r = validateUpdates([upd("NotARealField", "x")], fields, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/unknown field/);
  });

  it("rejects non-updateable fields", () => {
    const r = validateUpdates([upd("CreatedDate", "2026-01-01T00:00:00Z")], fields, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/not updateable/);
  });

  it("allows any updateable field (no allow-list gate)", () => {
    const r = validateUpdates([upd("OwnerId", "005000000000001AAA")], fields, current);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid[0].to).toBe("005000000000001AAA");
  });

  it("rejects over-length strings without truncating", () => {
    const r = validateUpdates([upd("NextStep", "x".repeat(300))], fields, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/exceeds max length 255/);
  });

  it("rejects unknown picklist values", () => {
    const r = validateUpdates([upd("StageName", "Totally Made Up")], fields, current);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/not an active picklist value/);
  });

  it("normalizes picklist case and reports it", () => {
    const r = validateUpdates([upd("StageName", "proposal/price quote")], fields, current);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid[0].to).toBe("Proposal/Price Quote");
    expect(r.valid[0].from).toBe("Qualification");
    expect(r.valid[0].normalizedNote).toBeDefined();
  });

  it("coerces numeric strings (with currency symbols) to numbers", () => {
    const r = validateUpdates([upd("Amount", "$85,000")], fields, current);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid[0].to).toBe(85000);
  });

  it("accepts a valid ISO date and rejects a non-ISO one", () => {
    const ok = validateUpdates([upd("CloseDate", "2026-06-30")], fields, current);
    expect(ok.valid[0].to).toBe("2026-06-30");

    const bad = validateUpdates([upd("CloseDate", "June 30, 2026")], fields, current);
    expect(bad.valid).toHaveLength(0);
    expect(bad.rejected[0].reason).toMatch(/YYYY-MM-DD/);
  });
});
