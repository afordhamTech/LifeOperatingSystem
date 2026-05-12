import { describe, expect, it } from "vitest";
import {
  buildOneMoveVerdictSummary,
  parseOneMoveVerdict,
  serializeOneMoveVerdict,
  upsertOneMoveVerdictIntoNotes,
} from "@/lib/one-move-verdict";

describe("parseOneMoveVerdict", () => {
  it("returns null verdict for null/undefined/empty/whitespace notes", () => {
    expect(parseOneMoveVerdict(null)).toEqual({ outcome: null, note: "" });
    expect(parseOneMoveVerdict(undefined)).toEqual({ outcome: null, note: "" });
    expect(parseOneMoveVerdict("")).toEqual({ outcome: null, note: "" });
    expect(parseOneMoveVerdict("   \n  ")).toEqual({ outcome: null, note: "" });
  });

  it("round-trips a valid sentinel", () => {
    const serialized = serializeOneMoveVerdict({
      outcome: "partial",
      note: "I started but missed Friday",
    });
    expect(parseOneMoveVerdict(serialized)).toEqual({
      outcome: "partial",
      note: "I started but missed Friday",
    });
  });

  it("parses outcome case-insensitively", () => {
    const verdict = parseOneMoveVerdict(
      "[oneMoveVerdict] outcome=Worked; note=ok",
    );
    expect(verdict.outcome).toBe("worked");
    expect(verdict.note).toBe("ok");
  });

  it("safely decodes a URI-encoded note with semicolons and newlines", () => {
    const note = "I started; then; \n missed Friday";
    const serialized = serializeOneMoveVerdict({ outcome: "missed", note });
    const parsed = parseOneMoveVerdict(serialized);
    expect(parsed.outcome).toBe("missed");
    expect(parsed.note).toBe(note);
  });

  it("ignores malformed sentinel lines", () => {
    expect(parseOneMoveVerdict("[oneMoveVerdict] outcome=garbage; note=x")).toEqual({
      outcome: null,
      note: "",
    });
    expect(parseOneMoveVerdict("[oneMoveVerdict] not really")).toEqual({
      outcome: null,
      note: "",
    });
  });

  it("does not throw on malformed URI-encoded note", () => {
    expect(
      parseOneMoveVerdict("[oneMoveVerdict] outcome=worked; note=%E0%A4%A"),
    ).toEqual({
      outcome: "worked",
      note: "%E0%A4%A",
    });
  });
});

describe("upsertOneMoveVerdictIntoNotes", () => {
  const verdict = { outcome: "worked" as const, note: "kept the block" };
  const sentinel = serializeOneMoveVerdict(verdict);

  it("appends a sentinel when none exists", () => {
    const next = upsertOneMoveVerdictIntoNotes("Tuesday was rough.", verdict);
    expect(next).toContain("Tuesday was rough.");
    expect(next.split("\n").filter((line) => line.startsWith("[oneMoveVerdict]"))).toEqual([
      sentinel,
    ]);
  });

  it("replaces an existing sentinel without duplicating it", () => {
    const before = `Header line\n[oneMoveVerdict] outcome=missed; note=old\nFooter line`;
    const after = upsertOneMoveVerdictIntoNotes(before, verdict);
    expect(after).toContain("Header line");
    expect(after).toContain("Footer line");
    expect(after.match(/\[oneMoveVerdict\]/g)).toHaveLength(1);
    expect(parseOneMoveVerdict(after)).toEqual({
      outcome: "worked",
      note: "kept the block",
    });
  });

  it("collapses multiple sentinel lines into one updated sentinel", () => {
    const before =
      "[oneMoveVerdict] outcome=missed; note=a\n[oneMoveVerdict] outcome=partial; note=b";
    const after = upsertOneMoveVerdictIntoNotes(before, verdict);
    expect(after.match(/\[oneMoveVerdict\]/g)).toHaveLength(1);
    expect(parseOneMoveVerdict(after)).toEqual({
      outcome: "worked",
      note: "kept the block",
    });
  });

  it("returns just the sentinel for empty/null existing notes", () => {
    expect(upsertOneMoveVerdictIntoNotes(null, verdict)).toBe(sentinel);
    expect(upsertOneMoveVerdictIntoNotes("", verdict)).toBe(sentinel);
  });

  it("preserves non-sentinel content when appending", () => {
    const before = "Line A\nLine B\n   ";
    const after = upsertOneMoveVerdictIntoNotes(before, verdict);
    const lines = after.split("\n");
    expect(lines[0]).toBe("Line A");
    expect(lines[1]).toBe("Line B");
    expect(lines[lines.length - 1]).toBe(sentinel);
  });
});

describe("serializeOneMoveVerdict", () => {
  it("emits canonical format", () => {
    expect(
      serializeOneMoveVerdict({ outcome: "skipped", note: "no time" }),
    ).toBe("[oneMoveVerdict] outcome=skipped; note=no%20time");
  });

  it("throws on invalid outcome", () => {
    expect(() =>
      serializeOneMoveVerdict({
        outcome: "broken" as unknown as "worked",
        note: "",
      }),
    ).toThrow();
  });
});

describe("buildOneMoveVerdictSummary", () => {
  it("handles no one move", () => {
    expect(buildOneMoveVerdictSummary(null, { outcome: null, note: "" })).toBe(
      "No one move was set last week.",
    );
    expect(buildOneMoveVerdictSummary("   ", { outcome: "worked", note: "x" })).toBe(
      "No one move was set last week.",
    );
  });

  it("handles a one move without verdict", () => {
    expect(
      buildOneMoveVerdictSummary("Close one decision review", {
        outcome: null,
        note: "",
      }),
    ).toBe("No verdict recorded yet for: Close one decision review");
  });

  it("handles a one move with verdict", () => {
    expect(
      buildOneMoveVerdictSummary("Close one decision review", {
        outcome: "partial",
        note: "Closed 1 of 2",
      }),
    ).toBe("partial — Close one decision review. Note: Closed 1 of 2");
  });

  it("omits Note suffix when note is empty", () => {
    expect(
      buildOneMoveVerdictSummary("Cap each day", {
        outcome: "worked",
        note: "  ",
      }),
    ).toBe("worked — Cap each day");
  });
});
