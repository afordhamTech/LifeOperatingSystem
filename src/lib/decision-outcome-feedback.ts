// Pure helpers for Phase B4 Decision Outcome Feedback.
// Heuristic only. Read-only. Does not mutate decisions or tasks.

import type { DecisionLog } from "@/lib/lifeee-persistence";
import { hasResult, reviewedTimestamp } from "@/lib/decision-log-summary";

export type OutcomeSentiment = "positive" | "negative" | "neutral";

const POSITIVE_CUES = [
  "win",
  "won",
  "worked",
  "works",
  "good",
  "great",
  "kept",
  "keep",
  "helped",
  "helpful",
  "yes",
  "worth",
  "smart",
  "right call",
  "right choice",
  "best",
  "succeeded",
];

const NEGATIVE_CUES = [
  "bad",
  "wasted",
  "waste",
  "no ",
  "broke",
  "missed",
  "hurt",
  "failed",
  "fail",
  "regret",
  "wrong",
  "mistake",
  "lost",
  "drained",
];

export function normalizeDecisionText(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[.,;:!?"'`()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyOutcomeSentiment(
  resultLater: string | null | undefined,
): OutcomeSentiment {
  const trimmed = resultLater?.trim();
  if (!trimmed) return "neutral";
  const normalized = ` ${trimmed.toLowerCase()} `;

  for (const cue of NEGATIVE_CUES) {
    const needle = cue.includes(" ") ? cue : ` ${cue} `;
    if (normalized.startsWith(` ${cue}`) || normalized.includes(needle)) {
      return "negative";
    }
  }
  for (const cue of POSITIVE_CUES) {
    const needle = cue.includes(" ") ? cue : ` ${cue} `;
    if (normalized.startsWith(` ${cue}`) || normalized.includes(needle)) {
      return "positive";
    }
  }
  return "neutral";
}

export function matchTaskToReviewedDecision(
  taskTitle: string,
  decisions: DecisionLog[],
): DecisionLog | null {
  const normalizedTitle = normalizeDecisionText(taskTitle);
  if (!normalizedTitle) return null;

  const candidates = decisions
    .filter(hasResult)
    .filter((d) => normalizeDecisionText(d.decision) === normalizedTitle);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aTs = reviewedTimestamp(a) ?? a.created_at ?? "";
    const bTs = reviewedTimestamp(b) ?? b.created_at ?? "";
    return bTs.localeCompare(aTs);
  });

  return candidates[0] ?? null;
}

export type OutcomeMatch = {
  taskId: string;
  decision: DecisionLog;
  sentiment: OutcomeSentiment;
};

export function buildOutcomeMatches<T extends { id: string; title: string }>(
  tasks: T[],
  decisions: DecisionLog[],
): Record<string, OutcomeMatch> {
  const map: Record<string, OutcomeMatch> = {};
  if (decisions.length === 0) return map;
  for (const task of tasks) {
    const match = matchTaskToReviewedDecision(task.title, decisions);
    if (!match) continue;
    map[task.id] = {
      taskId: task.id,
      decision: match,
      sentiment: classifyOutcomeSentiment(match.result_later ?? null),
    };
  }
  return map;
}

export function buildOutcomeFeedbackSummary(
  decisions: DecisionLog[],
  options: { maxPerGroup?: number } = {},
): string {
  const maxPerGroup = options.maxPerGroup ?? 3;
  const reviewed = decisions.filter(hasResult);

  if (reviewed.length === 0) {
    return "No reviewed decision outcomes yet.";
  }

  const positives: DecisionLog[] = [];
  const negatives: DecisionLog[] = [];
  const neutrals: DecisionLog[] = [];

  for (const decision of reviewed) {
    const sentiment = classifyOutcomeSentiment(decision.result_later ?? null);
    if (sentiment === "positive") positives.push(decision);
    else if (sentiment === "negative") negatives.push(decision);
    else neutrals.push(decision);
  }

  const byRecent = (a: DecisionLog, b: DecisionLog) => {
    const aTs = reviewedTimestamp(a) ?? a.created_at ?? "";
    const bTs = reviewedTimestamp(b) ?? b.created_at ?? "";
    return bTs.localeCompare(aTs);
  };
  positives.sort(byRecent);
  negatives.sort(byRecent);
  neutrals.sort(byRecent);

  const renderLine = (d: DecisionLog) =>
    `- ${d.decision} → ${d.result_later?.trim() ?? ""}`;

  const sections: string[] = [];
  if (positives.length > 0) {
    sections.push(
      `Recent positive outcomes:\n${positives.slice(0, maxPerGroup).map(renderLine).join("\n")}`,
    );
  }
  if (negatives.length > 0) {
    sections.push(
      `Recent negative outcomes:\n${negatives.slice(0, maxPerGroup).map(renderLine).join("\n")}`,
    );
  }
  if (neutrals.length > 0) {
    sections.push(
      `Neutral / unclear outcomes:\n${neutrals.slice(0, maxPerGroup).map(renderLine).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
