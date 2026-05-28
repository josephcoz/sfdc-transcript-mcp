import type { Connection } from "jsforce";

export interface FieldMeta {
  name: string;
  label: string;
  type: string; // string | picklist | double | date | datetime | boolean | reference | ...
  updateable: boolean;
  length?: number;
  picklistValues?: string[]; // active values only
  restrictedPicklist?: boolean;
  referenceTo?: string[];
  inlineHelpText?: string; // the field's help text — context for what to extract
}

// Describe results are stable within a session; cache per org+sobject.
const cache = new Map<string, FieldMeta[]>();

/** Describe an sObject's fields (cached), normalized to what we need for validation. */
export async function describeFields(
  conn: Connection,
  orgId: string,
  sobject: string,
): Promise<FieldMeta[]> {
  const key = `${orgId}:${sobject}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const meta = await conn.describe(sobject);
  const fields: FieldMeta[] = meta.fields.map((f) => {
    const field = f as {
      name: string;
      label: string;
      type: string;
      updateable: boolean;
      length?: number;
      restrictedPicklist?: boolean;
      picklistValues?: Array<{ value: string; active: boolean }>;
      referenceTo?: string[];
      inlineHelpText?: string | null;
    };
    const picks = (field.picklistValues ?? []).filter((p) => p.active).map((p) => p.value);
    return {
      name: field.name,
      label: field.label,
      type: field.type,
      updateable: !!field.updateable,
      length: field.length || undefined,
      picklistValues: picks.length ? picks : undefined,
      restrictedPicklist: field.restrictedPicklist || undefined,
      referenceTo: field.referenceTo?.length ? field.referenceTo : undefined,
      inlineHelpText: field.inlineHelpText || undefined,
    };
  });

  cache.set(key, fields);
  return fields;
}
