import { readFileSync } from "node:fs";
import matter from "gray-matter";

export interface TranscriptFrontmatter {
  title?: string;
  date?: string;
  source?: string;
  duration?: number;
}

export interface Turn {
  speaker: "You" | "Others";
  text: string;
  /** Character offsets of the whole turn within the raw transcript text. */
  span: { start: number; end: number };
  injectionFlag?: boolean;
}

export interface ParsedTranscript {
  frontmatter: TranscriptFrontmatter;
  turns: Turn[];
}

export interface TranscriptInput {
  path?: string;
  text?: string;
}

/** Parse a MeetingScribe-shaped transcript into ordered speaker turns + frontmatter. */
export function parseTranscript(input: TranscriptInput): ParsedTranscript {
  const raw = resolveText(input);
  return { frontmatter: parseFrontmatter(raw), turns: parseTurns(raw) };
}

function resolveText({ path, text }: TranscriptInput): string {
  if (text !== undefined && text !== "") return text;
  if (path) return readFileSync(path, "utf8");
  throw new Error("provide either transcript.path or transcript.text");
}

/**
 * Read the frontmatter we actually use (title/date for the audit ref). Real
 * MeetingScribe frontmatter can be invalid flow-YAML (e.g. a colon in `title`,
 * or `attendees: [[[Name]], ...]`), so a YAML failure falls back to a tolerant
 * line scan rather than aborting the whole parse.
 */
function parseFrontmatter(raw: string): TranscriptFrontmatter {
  try {
    return pickFrontmatter(matter(raw).data as Record<string, unknown>);
  } catch {
    return lenientFrontmatter(raw);
  }
}

function pickFrontmatter(data: Record<string, unknown>): TranscriptFrontmatter {
  const out: TranscriptFrontmatter = {};
  if (typeof data.title === "string") out.title = data.title;
  if (typeof data.date === "string") out.date = data.date;
  else if (data.date instanceof Date) out.date = data.date.toISOString().slice(0, 10);
  if (typeof data.source === "string") out.source = data.source;
  if (typeof data.duration === "number") out.duration = data.duration;
  return out;
}

function lenientFrontmatter(raw: string): TranscriptFrontmatter {
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: TranscriptFrontmatter = {};
  if (!block) return out;
  for (const line of block[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "title") out.title = val;
    else if (key === "date") out.date = val;
    else if (key === "source") out.source = val;
    else if (key === "duration" && val !== "" && !Number.isNaN(Number(val))) {
      out.duration = Number(val);
    }
  }
  return out;
}

function parseTurns(raw: string): Turn[] {
  const heading = raw.match(/^##\s+Transcript\s*$/m);
  const bodyStart = heading?.index ?? 0;
  const re =
    /\*\*(You|Others):\*\*[ \t]*([\s\S]*?)(?=\n[ \t]*\*\*(?:You|Others):\*\*|\n[ \t]*##\s|$)/g;
  re.lastIndex = bodyStart;

  const turns: Turn[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    turns.push({
      speaker: m[1] as "You" | "Others",
      text: m[2].trim(),
      span: { start: m.index, end: m.index + m[0].length },
    });
  }
  return turns;
}
