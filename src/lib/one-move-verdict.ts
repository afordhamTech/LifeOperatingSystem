// Phase B8 One Move Verdict.
// Persists in weekly_reviews.notes via a single tagged sentinel line:
// [oneMoveVerdict] outcome=<worked|partial|missed|skipped>; note=<encoded note>
// Pure helpers. No persistence. No React.

export type OneMoveVerdictOutcome = "worked" | "partial" | "missed" | "skipped";

export type OneMoveVerdict = {
  outcome: OneMoveVerdictOutcome | null;
  note: string;
};

const ALLOWED_OUTCOMES: OneMoveVerdictOutcome[] = [
  "worked",
  "partial",
  "missed",
  "skipped",
];

const SENTINEL_PREFIX = "[oneMoveVerdict]";
const SENTINEL_PATTERN = /^\s*\[oneMoveVerdict\]\s*outcome=([^;]*);\s*note=(.*)$/i;

function isOutcome(value: string): value is OneMoveVerdictOutcome {
  return (ALLOWED_OUTCOMES as string[]).includes(value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseOneMoveVerdict(
  notes: string | null | undefined,
): OneMoveVerdict {
  if (!notes) return { outcome: null, note: "" };
  const text = notes.trim();
  if (!text) return { outcome: null, note: "" };

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(SENTINEL_PATTERN);
    if (!match) continue;
    const rawOutcome = (match[1] ?? "").trim().toLowerCase();
    if (!isOutcome(rawOutcome)) continue;
    const rawNote = (match[2] ?? "").trim();
    return { outcome: rawOutcome, note: safeDecode(rawNote) };
  }

  return { outcome: null, note: "" };
}

export function serializeOneMoveVerdict(verdict: {
  outcome: OneMoveVerdictOutcome;
  note: string;
}): string {
  const outcome = verdict.outcome.trim().toLowerCase();
  if (!isOutcome(outcome)) {
    throw new Error(`Invalid outcome: ${verdict.outcome}`);
  }
  const encoded = encodeURIComponent(verdict.note ?? "");
  return `${SENTINEL_PREFIX} outcome=${outcome}; note=${encoded}`;
}

export function upsertOneMoveVerdictIntoNotes(
  existingNotes: string | null | undefined,
  verdict: { outcome: OneMoveVerdictOutcome; note: string },
): string {
  const sentinel = serializeOneMoveVerdict(verdict);
  if (!existingNotes) return sentinel;

  const lines = existingNotes.split(/\r?\n/);
  const kept: string[] = [];
  let replaced = false;
  for (const line of lines) {
    if (SENTINEL_PATTERN.test(line)) {
      if (!replaced) {
        kept.push(sentinel);
        replaced = true;
      }
      // drop additional sentinel lines
      continue;
    }
    kept.push(line);
  }

  if (!replaced) {
    // Trim trailing empty lines, then append sentinel on a new line.
    while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();
    if (kept.length === 0) return sentinel;
    kept.push(sentinel);
  }

  return kept.join("\n");
}

export function buildOneMoveVerdictSummary(
  oneMove: string | null | undefined,
  verdict: OneMoveVerdict,
): string {
  const move = (oneMove ?? "").trim();
  if (!move) return "No one move was set last week.";
  if (!verdict.outcome) return `No verdict recorded yet for: ${move}`;
  const noteSuffix = verdict.note.trim()
    ? `. Note: ${verdict.note.trim()}`
    : "";
  return `${verdict.outcome} — ${move}${noteSuffix}`;
}
