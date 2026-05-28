import type { Connection } from "jsforce";
import { logger } from "../logger.js";

// Tracked-field sets are stable within a session; cache per org.
const cache = new Map<string, Set<string>>();

/**
 * Opportunity fields that have field-history tracking enabled, read from the
 * Tooling API's `FieldDefinition.IsFieldHistoryTracked`. Tracked fields are a
 * strong signal of "what reps care about." This is a relevance hint, not a
 * security gate, so if the org blocks the Tooling query we degrade to an empty
 * set rather than failing.
 */
export async function historyTrackedFields(conn: Connection, orgId: string): Promise<Set<string>> {
  const cached = cache.get(orgId);
  if (cached) return cached;

  const tracked = new Set<string>();
  try {
    const soql =
      "SELECT QualifiedApiName, IsFieldHistoryTracked FROM FieldDefinition " +
      "WHERE EntityDefinition.QualifiedApiName = 'Opportunity'";
    const res = await conn.tooling.query(soql);
    const records = res.records as Array<{ QualifiedApiName: string; IsFieldHistoryTracked: boolean }>;
    for (const r of records) {
      if (r.IsFieldHistoryTracked) tracked.add(r.QualifiedApiName);
    }
  } catch (err) {
    logger.warn("could not read Opportunity field-history tracking via Tooling API", {
      message: (err as Error).message,
    });
  }

  cache.set(orgId, tracked);
  return tracked;
}
