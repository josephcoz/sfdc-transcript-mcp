import type { Connection } from "jsforce";

export interface RecordMatch {
  id: string;
  sobject: string;
  name: string;
  url: string;
}

/**
 * Find records of a known sObject by a name substring. `sobject` comes from a
 * fixed enum (not user-arbitrary), so it's safe to interpolate; the query text
 * is escaped for the SOQL string literal.
 */
export async function findRecords(
  conn: Connection,
  instanceUrl: string,
  sobject: string,
  query: string,
  limit: number,
): Promise<RecordMatch[]> {
  const q = escapeSoqlLiteral(query);
  const lim = Math.max(1, Math.min(limit, 50));
  const soql = `SELECT Id, Name FROM ${sobject} WHERE Name LIKE '%${q}%' ORDER BY LastModifiedDate DESC LIMIT ${lim}`;
  const res = await conn.query<{ Id: string; Name: string }>(soql);
  return res.records.map((r) => ({
    id: r.Id,
    sobject,
    name: r.Name,
    url: `${instanceUrl}/${r.Id}`,
  }));
}

/** Read specific field values from a single record. */
export async function retrieveFields(
  conn: Connection,
  sobject: string,
  id: string,
  fields: string[],
): Promise<Record<string, unknown>> {
  if (fields.length === 0) return {};
  const cols = ["Id", ...fields].join(", ");
  const soql = `SELECT ${cols} FROM ${sobject} WHERE Id = '${escapeSoqlLiteral(id)}' LIMIT 1`;
  const res = await conn.query<Record<string, unknown>>(soql);
  return res.records[0] ?? {};
}

function escapeSoqlLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
