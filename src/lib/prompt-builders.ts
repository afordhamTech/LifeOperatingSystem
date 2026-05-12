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
  | "full-context";

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

Synthesize the full Lifeee context. Return a concise operating brief with priorities, risks, recommended next actions, and missing data.`;
  }
}
