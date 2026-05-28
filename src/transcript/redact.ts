import type { Turn } from "./parse.js";

/**
 * Injection-hardening for transcript turns.
 *
 * The transcript is UNTRUSTED data, never instructions. We never drop a turn —
 * dropping would hide tampering from the human. Instead we strip control chars,
 * cap length, and FLAG turns that look like attempts to steer the model or forge
 * tool calls, so both the human and the model see them for what they are.
 */

const MAX_TURN_CHARS = 5000;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)/i,
  /disregard\s+(the\s+)?(above|previous|prior)/i,
  /system\s+prompt/i,
  /you\s+are\s+now\b/i,
  /\bnew\s+instructions?\b/i,
  /\bset\s+the\b.{0,40}?\bfield\s+to\b/i,
  /<\/?(tool_call|function_call|function|tool)\b/i,
  /^\s*assistant\s*:/im,
  /<\|[^|>]*\|>/,
  /```/,
];

export function hardenTurns(turns: Turn[]): Turn[] {
  return turns.map(hardenTurn);
}

/** True if text matches a known injection pattern. Used to flag suspect proposals. */
export function containsInjectionPattern(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

function hardenTurn(turn: Turn): Turn {
  const cleaned = stripControlChars(turn.text);
  const capped = cleaned.slice(0, MAX_TURN_CHARS);
  const flagged =
    cleaned.length > MAX_TURN_CHARS || INJECTION_PATTERNS.some((re) => re.test(capped));
  const result: Turn = { ...turn, text: capped };
  if (flagged) result.injectionFlag = true;
  return result;
}

/** Drop C0/C1 control characters but keep tab (0x09), newline (0x0A), CR (0x0D). */
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
  }
  return out;
}
