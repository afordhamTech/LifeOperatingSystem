export type LifeeePromptKind =
  | "daily-plan"
  | "task-triage"
  | "calendar-planning"
  | "sleep-recovery"
  | "academic-rescue"
  | "mcat-tutor"
  | "workout-adjustment"
  | "nutrition-fix"
  | "weekly-review"
  | "bible-study"
  | "relationship-message"
  | "career-proof"
  | "full-context"
  | "weekly-strategy-brief";

export type PromptOption = {
  kind: LifeeePromptKind;
  label: string;
};

export type PromptBuilderContext = {
  date?: string;
  sourcePage?: string;
  operatingMode?: string;
  taskSummary?: string;
  timelineSummary?: string;
  sleepSummary?: string;
  academicsSummary?: string;
  calendarSummary?: string;
  mcatSummary?: string;
  workoutSummary?: string;
  nutritionSummary?: string;
  weeklyReviewSummary?: string;
  faithSummary?: string;
  relationshipSummary?: string;
  careerProofSummary?: string;
  antiDriftSummary?: string;
  decisionSummary?: string;
  reviewedDecisionsSummary?: string;
  outcomeFeedbackSummary?: string;
  decisionPatternSummary?: string;
  weeklyBottleneckSummary?: string;
  nextWeekOneMoveSummary?: string;
  lastWeekOneMoveVerdictSummary?: string;
  oneMoveFeedbackHistorySummary?: string;
};

export const PROMPT_OPTIONS: PromptOption[] = [
  { kind: "daily-plan", label: "Daily Plan" },
  { kind: "task-triage", label: "Task Triage" },
  { kind: "calendar-planning", label: "Calendar Planning" },
  { kind: "sleep-recovery", label: "Sleep Recovery" },
  { kind: "academic-rescue", label: "Academic Rescue" },
  { kind: "mcat-tutor", label: "MCAT Tutor" },
  { kind: "workout-adjustment", label: "Workout Adjustment" },
  { kind: "nutrition-fix", label: "Nutrition Fix" },
  { kind: "weekly-review", label: "Weekly Review" },
  { kind: "bible-study", label: "Bible Study" },
  { kind: "relationship-message", label: "Relationship Message" },
  { kind: "career-proof", label: "Career Proof" },
  { kind: "full-context", label: "Full Lifeee Context Export" },
  { kind: "weekly-strategy-brief", label: "Weekly Strategy Brief" },
];

const missing = "Not supplied in this export.";

function line(label: string, value: string | undefined) {
  return `${label}: ${value?.trim() || missing}`;
}

function baseHeader(title: string, context: PromptBuilderContext) {
  return `${title}

Use only the Lifeee context supplied below. If important data is missing, say what is missing instead of inventing it.

${line("Date", context.date)}
${line("Source page", context.sourcePage)}
${line("Operating mode", context.operatingMode)}`;
}

function commonContext(context: PromptBuilderContext) {
  return [
    line("Tasks", context.taskSummary),
    line("Timeline", context.timelineSummary),
    line("Calendar", context.calendarSummary),
    line("Sleep", context.sleepSummary),
    line("Academics", context.academicsSummary),
    line("MCAT", context.mcatSummary),
    line("Workout", context.workoutSummary),
    line("Nutrition", context.nutritionSummary),
    line("Weekly review", context.weeklyReviewSummary),
    line("Faith", context.faithSummary),
    line("Relationships", context.relationshipSummary),
    line("Career proof", context.careerProofSummary),
    line("Anti drift", context.antiDriftSummary),
    line("Decisions", context.decisionSummary),
    line("Decision review", context.reviewedDecisionsSummary),
    line("Outcome feedback", context.outcomeFeedbackSummary),
    line("Decision pattern", context.decisionPatternSummary),
    line("Weekly bottleneck", context.weeklyBottleneckSummary),
    line("This week's one move", context.nextWeekOneMoveSummary),
    line("Last week one move verdict", context.lastWeekOneMoveVerdictSummary),
    line("One move feedback history", context.oneMoveFeedbackHistorySummary),
  ].join("\n");
}

export function buildLifeeePrompt(kind: LifeeePromptKind, context: PromptBuilderContext = {}) {
  const shared = commonContext(context);

  switch (kind) {
    case "daily-plan":
      return `${baseHeader("Daily Plan", context)}

${shared}

Build a realistic plan for today. Return only:
1. Must do
2. Two should-do items
3. Maintenance
4. Recovery guardrail
5. What to ignore today`;
    case "task-triage":
      return `${baseHeader("Task Triage", context)}

${shared}

Sort the task list into Must Do, Should Do, Maintenance, Waiting, Quick Win, and Ignore Today. Explain any downgrade from urgent to ignored.`;
    case "calendar-planning":
      return `${baseHeader("Calendar Planning", context)}

${shared}

Use the anchors and open blocks to place the hard work, recovery, workout, and shutdown target. Flag overload honestly.`;
    case "sleep-recovery":
      return `${baseHeader("Sleep Recovery", context)}

${shared}

Create a sleep recovery plan for the next 24 hours. Include caffeine cutoff, training adjustment, nap guidance, and bedtime guardrails.`;
    case "academic-rescue":
      return `${baseHeader("Academic Rescue", context)}

${shared}

Identify the academic task most likely to damage the week if ignored. Build a rescue block with first physical action, timebox, and stop condition.`;
    case "mcat-tutor":
      return `${baseHeader("MCAT Tutor", context)}

${shared}

Tutor the next MCAT move using active recall. Start with three diagnostic questions, then give a compact explanation and a retest prompt.`;
    case "workout-adjustment":
      return `${baseHeader("Workout Adjustment", context)}

${shared}

Adjust today's workout to match sleep, soreness, pain, energy, and schedule. Return a concrete session or a recovery replacement.`;
    case "nutrition-fix":
      return `${baseHeader("Nutrition Fix", context)}

${shared}

Find the smallest nutrition correction that improves today. Include protein, hydration, meal timing, and one default meal option.`;
    case "weekly-review":
      return `${baseHeader("Weekly Review", context)}

${shared}

Run a weekly review. Identify the biggest win, biggest leak, next week's big three, and one system change.`;
    case "bible-study":
      return `${baseHeader("Bible Study", context)}

${shared}

Build a Bible study reflection from the supplied faith context. Include passage focus, lesson, prayer, action step, and temptation guardrail.`;
    case "relationship-message":
      return `${baseHeader("Relationship Message", context)}

${shared}

Draft a relationship message that is honest, warm, and not overdone. Include what to send, what not to say, and follow-up timing.`;
    case "career-proof":
      return `${baseHeader("Career Proof", context)}

${shared}

Review the proof locker. Identify the strongest artifact, the weakest evidence gap, the next proof item to ship, and one resume bullet.`;
    case "full-context":
      return `${baseHeader("Full Lifeee Context Export", context)}

${shared}

Use the Tasks section as structured task rows when task codes are present:
TASK-CODE | title | domain/task type | estimate | priority | consequence | due | energy | status | daily role | counts | notes.

Synthesize the full Lifeee context. Return a concise operating brief with priorities, risks, recommended next actions, missing data, and any task IDs that need planning attention.`;
    case "weekly-strategy-brief":
      return `${baseHeader("Weekly Strategy Brief", context)}

${shared}

Use ONLY the Lifeee context above. Do not invent data. Where context is absent, write "missing" or "not enough evidence" instead of guessing.

Synthesize this week's strategic posture from the weekly bottleneck, this week's one move, last week's one move verdict, one move feedback history, decision summary, reviewed decisions, outcome feedback, decision pattern, and the task/calendar context.

Return EXACTLY these sections, in this order, each one to three short lines:
1. Bottleneck restated
2. One move to protect
3. One specific risk
4. One habit to keep
5. One habit to cut
6. Next 24-hour action

Keep the entire brief tight and operational. No preambles, no encouragements, no recap of the input.`;
  }
}
