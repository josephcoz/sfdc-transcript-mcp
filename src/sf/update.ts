import type { Connection } from "jsforce";

/** Write field updates to a single record. Throws on a failed save. */
export async function applyRecordUpdate(
  conn: Connection,
  sobject: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const result = await conn.sobject(sobject).update({ Id: id, ...fields });
  const results = Array.isArray(result) ? result : [result];
  const failed = results.filter((r) => !r.success);
  if (failed.length) {
    const errs = failed.flatMap((r) => r.errors ?? []);
    throw new Error(`Salesforce update failed: ${JSON.stringify(errs)}`);
  }
}
