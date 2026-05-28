import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTranscript } from "../src/transcript/parse.js";

const cleanText = readFileSync(new URL("fixtures/opportunity-call.md", import.meta.url), "utf8");

describe("parseTranscript", () => {
  it("reads title and date from frontmatter", () => {
    const { frontmatter } = parseTranscript({ text: cleanText });
    expect(frontmatter.title).toBe("Acme Corp - New Platform Subscription");
    expect(frontmatter.date).toBe("2026-05-27");
    expect(frontmatter.duration).toBe(18);
  });

  it("extracts ordered You/Others turns", () => {
    const { turns } = parseTranscript({ text: cleanText });
    expect(turns).toHaveLength(10);
    expect(turns[0].speaker).toBe("You");
    expect(turns[1].speaker).toBe("Others");
    expect(turns.at(-1)?.speaker).toBe("Others");
    expect(turns[0].text).toContain("Thanks for making time");
  });

  it("produces non-overlapping, increasing spans", () => {
    const { turns } = parseTranscript({ text: cleanText });
    for (let i = 0; i < turns.length; i++) {
      expect(turns[i].span.start).toBeLessThan(turns[i].span.end);
      if (i > 0) expect(turns[i - 1].span.end).toBeLessThanOrEqual(turns[i].span.start);
      // The captured span should bound the verbatim text.
      const slice = cleanText.slice(turns[i].span.start, turns[i].span.end);
      expect(slice).toContain(turns[i].text.slice(0, 20));
    }
  });

  it("tolerates real MeetingScribe quirks (colon in title, bracket attendees, bare-int duration)", () => {
    const quirky = `---
date: 2026-05-27
title: Sync: Q3 planning
attendees: [[[Joe Smith]], [[Jane Doe]]]
source: meetingscribe
duration: 30
---

# Sync: Q3 planning

## Attendees
- [[Joe Smith]]
- [[Jane Doe]]

## Transcript

**You:** Hello there.

**Others:** Hi, good to chat.
`;
    const parsed = parseTranscript({ text: quirky });
    expect(parsed.turns).toHaveLength(2);
    expect(parsed.frontmatter.title).toBe("Sync: Q3 planning");
    expect(parsed.frontmatter.duration).toBe(30);
  });

  it("throws when given neither path nor text", () => {
    expect(() => parseTranscript({})).toThrow();
  });
});
