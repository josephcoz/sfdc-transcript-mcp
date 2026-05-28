import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import envPaths from "env-paths";

/**
 * Append-only audit log of every proposed/applied write.
 *
 * Lives under the OS app-data dir (same root as the token store), one JSONL
 * file per month. NEVER records tokens or the full transcript — only the cited
 * source span that justified each change.
 */

const paths = envPaths("sfdc-transcript-mcp", { suffix: "" });

export interface AuditEntry {
  orgId: string;
  username: string;
  sobject: string;
  recordId: string;
  field: string;
  from: unknown;
  to: unknown;
  dryRun: boolean;
  suspicious?: boolean;
  sourceSpan?: { speaker: string; quote: string };
  transcriptRef: { title: string; date: string; hash: string };
}

function auditDir(): string {
  const dir = join(paths.data, "audit");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function fileForMonth(d: Date): string {
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return join(auditDir(), `${ym}.jsonl`);
}

/** Append one JSONL line per entry; returns a shared auditId for the batch. */
export function writeAudit(entries: AuditEntry[]): string {
  const auditId = randomUUID();
  if (entries.length === 0) return auditId;
  const ts = new Date();
  const lines = entries.map((e) => JSON.stringify({ auditId, ts: ts.toISOString(), ...e })).join("\n");
  appendFileSync(fileForMonth(ts), `${lines}\n`);
  return auditId;
}
