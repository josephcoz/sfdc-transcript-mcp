import type { FieldMeta } from "../sf/describe.js";
import type { ProposedUpdate } from "./schema.js";

export interface ValidUpdate {
  field: string;
  from: unknown;
  to: string | number | boolean;
  /** Set when the value was normalized (e.g. picklist case) — surfaced, never silent. */
  normalizedNote?: string;
}

export interface RejectedUpdate {
  field: string;
  reason: string;
}

export interface ValidationResult {
  valid: ValidUpdate[];
  rejected: RejectedUpdate[];
}

/**
 * Re-validate model-proposed updates server-side, independent of what the model
 * or transcript claimed. Gates run in order; the first failure rejects the
 * update with a human-readable reason. This is the hard wall the whole safety
 * model rests on, so it must be enforced here regardless of upstream trust.
 */
export function validateUpdates(
  updates: ProposedUpdate[],
  fields: FieldMeta[],
  allowed: string[] | null,
  current: Record<string, unknown>,
): ValidationResult {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const result: ValidationResult = { valid: [], rejected: [] };

  for (const u of updates) {
    // Gate 1: allow-list.
    if (allowed === null) {
      result.rejected.push({ field: u.field, reason: "no allow-list configured; writes are disabled" });
      continue;
    }
    if (!allowed.includes(u.field)) {
      result.rejected.push({ field: u.field, reason: `field "${u.field}" is not in the allow-list` });
      continue;
    }

    // Gate 2: field exists on the sObject.
    const meta = byName.get(u.field);
    if (!meta) {
      result.rejected.push({ field: u.field, reason: `unknown field "${u.field}" on this sObject` });
      continue;
    }

    // Gate 3: updateable (rejects system/formula/audit fields regardless of allow-list).
    if (!meta.updateable) {
      result.rejected.push({ field: u.field, reason: `field "${u.field}" is not updateable` });
      continue;
    }

    // Gate 4: type / length / picklist.
    const coerced = coerceValue(meta, u.value);
    if ("error" in coerced) {
      result.rejected.push({ field: u.field, reason: coerced.error });
      continue;
    }

    result.valid.push({
      field: u.field,
      from: current[u.field] ?? null,
      to: coerced.to,
      ...(coerced.note ? { normalizedNote: coerced.note } : {}),
    });
  }

  return result;
}

type Coerced = { to: string | number | boolean; note?: string } | { error: string };

function coerceValue(meta: FieldMeta, value: string | number | boolean): Coerced {
  switch (meta.type) {
    case "picklist":
    case "multipicklist":
      return coercePicklist(meta, value);
    case "boolean":
      return coerceBoolean(value);
    case "int":
      return coerceNumber(value, true);
    case "double":
    case "currency":
    case "percent":
      return coerceNumber(value, false);
    case "date":
      return coerceDate(value);
    case "datetime":
      return coerceDatetime(value);
    default:
      return coerceString(meta, value);
  }
}

function coerceString(meta: FieldMeta, value: string | number | boolean): Coerced {
  const str = typeof value === "string" ? value : String(value);
  if (meta.length && str.length > meta.length) {
    return { error: `value exceeds max length ${meta.length} (got ${str.length})` };
  }
  return { to: str };
}

function coerceNumber(value: string | number | boolean, requireInt: boolean): Coerced {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value.replace(/[$,]/g, ""));
  else return { error: `expected a number, got ${JSON.stringify(value)}` };
  if (!Number.isFinite(n)) return { error: `value is not a finite number: ${JSON.stringify(value)}` };
  if (requireInt && !Number.isInteger(n)) return { error: `expected an integer, got ${n}` };
  return { to: n };
}

function coerceBoolean(value: string | number | boolean): Coerced {
  if (typeof value === "boolean") return { to: value };
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return { to: true };
    if (v === "false") return { to: false };
  }
  return { error: `expected a boolean, got ${JSON.stringify(value)}` };
}

function coerceDate(value: string | number | boolean): Coerced {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: `expected a date as YYYY-MM-DD, got ${JSON.stringify(value)}` };
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    return { error: `not a valid calendar date: ${value}` };
  }
  return { to: value };
}

function coerceDatetime(value: string | number | boolean): Coerced {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return { error: `expected an ISO-8601 datetime, got ${JSON.stringify(value)}` };
  }
  return { to: value };
}

function coercePicklist(meta: FieldMeta, value: string | number | boolean): Coerced {
  if (typeof value !== "string") {
    return { error: `picklist value must be text, got ${JSON.stringify(value)}` };
  }
  const active = meta.picklistValues ?? [];
  if (active.length === 0) {
    return { error: `no active picklist values are available for "${meta.name}"` };
  }

  const parts = meta.type === "multipicklist" ? value.split(";").map((p) => p.trim()) : [value];
  const canonical: string[] = [];
  let normalized = false;
  for (const part of parts) {
    const exact = active.find((a) => a === part);
    if (exact) {
      canonical.push(exact);
      continue;
    }
    const ci = active.find((a) => a.toLowerCase() === part.toLowerCase());
    if (ci) {
      canonical.push(ci);
      normalized = true;
      continue;
    }
    return {
      error: `"${part}" is not an active picklist value for "${meta.name}" (allowed: ${active.join(", ")})`,
    };
  }

  const to = canonical.join(";");
  return normalized ? { to, note: `normalized to "${to}"` } : { to };
}
