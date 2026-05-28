import { readFileSync } from "node:fs";
import { allowlistPath } from "./config.js";

/** Map of sObject API name -> allowed (writable) field API names. */
export type AllowList = Record<string, string[]>;

let cached: AllowList | null | undefined;

export function loadAllowList(): AllowList | null {
  if (cached !== undefined) return cached;
  const p = allowlistPath();
  if (!p) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(readFileSync(p, "utf8")) as AllowList;
  } catch (e) {
    throw new Error(`Failed to read field allow-list at ${p}: ${(e as Error).message}`);
  }
  return cached;
}

/**
 * Allowed field names for an sObject.
 *  - `null`  => no allow-list configured (SF_ALLOWLIST_PATH unset)
 *  - `[]`    => allow-list configured but nothing permitted for this sObject
 */
export function allowedFields(sobject: string): string[] | null {
  const al = loadAllowList();
  if (!al) return null;
  return al[sobject] ?? [];
}
