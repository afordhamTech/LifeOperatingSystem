import { getWeekStartDate, toDateKey } from "@/lib/date-helpers";

export const MCAT_TOPIC_STATUSES = [
  "Not learned yet",
  "Learning now",
  "Reviewed",
  "Practiced",
  "Stable",
  "Practice ready",
  "MCAT ready",
] as const;

export const MCAT_PRIORITY_LABELS = [
  "Study Now",
  "Preview Lightly",
  "Delay Until Coursework",
  "Passage Practice Later",
  "CARS Always Available",
] as const;

export const MCAT_ERROR_TYPES = [
  "Never learned",
  "Forgotten",
  "Concept gap",
  "Reasoning error",
  "Math error",
  "Careless error",
  "Trap answer",
] as const;

export const CARS_ERROR_TYPES = [
  "Main idea miss",
  "Tone miss",
  "Out of scope",
  "Too extreme",
  "Opposite answer",
  "Unsupported inference",
  "Evidence mismatch",
] as const;

export type McatTopicStatus = (typeof MCAT_TOPIC_STATUSES)[number];
export type McatPriorityLabel = (typeof MCAT_PRIORITY_LABELS)[number];
export type McatErrorType = (typeof MCAT_ERROR_TYPES)[number];
export type CarsErrorType = (typeof CARS_ERROR_TYPES)[number];
export type AnyMcatErrorType = McatErrorType | CarsErrorType;

export type McatTopic = {
  id: string;
  unit: string;
  title: string;
  status: McatTopicStatus;
  priorityLabel: McatPriorityLabel;
  foundationFit: number;
  yieldScore: number;
  weakness: number;
  courseworkAlignment: number;
  retestUrgency: number;
  courseworkDelayPenalty: number;
  questionsAttempted: number;
  questionsCorrect: number;
  explanationConfidence: number;
  retestSuccess: number;
  flashcardsDue: number;
  lastReviewed: string | null;
  lastRetested: string | null;
};

export type McatSession = {
  id: string;
  date: string;
  topicId: string;
  minutes: number;
  questionsAttempted: number;
  questionsCorrect: number;
  confidenceBefore: number;
  confidenceAfter: number;
  mistakeTypes: AnyMcatErrorType[];
  notes: string;
  flashcardsMade: number;
};

export type McatErrorLog = {
  id: string;
  date: string;
  topicId: string;
  type: AnyMcatErrorType;
  note: string;
  resolved: boolean;
};

export type CarsEntry = {
  id: string;
  date: string;
  passages: number;
  questionsAttempted: number;
  questionsCorrect: number;
  errorTypes: CarsErrorType[];
  minutes: number;
};

export type McatFoundationState = {
  stage: "Foundation Builder";
  topics: McatTopic[];
  sessions: McatSession[];
  errors: McatErrorLog[];
  carsEntries: CarsEntry[];
  updatedAt: string;
};

export type McatTopicScores = {
  topic: McatTopic;
  mcatStudyPriority: number;
  topicMastery: number;
  retestPriority: number;
  studyDecision: number;
};

export type McatSummary = {
  scoredTopics: McatTopicScores[];
  currentBestTopic: McatTopic | null;
  weakestTopic: McatTopic | null;
  nextRetest: McatTopic | null;
  carsPassageCountThisWeek: number;
  questionsAttempted: number;
  questionsCorrect: number;
  accuracy: number;
  accuracyTrend: number;
  flashcardsDue: number;
  minutesThisWeek: number;
  sessionsThisWeek: McatSession[];
  errorsThisWeek: McatErrorLog[];
  topicsStudiedThisWeek: string[];
  mistakeTypeCounts: Record<string, number>;
  carsRisk: number;
};

const STORAGE_KEY = "lifeee:mcat-foundation-os:v1";

const STUDY_NOW = new Set([
  "Acid base chemistry",
  "Buffers",
  "Titrations",
  "Equilibrium",
  "Stoichiometry",
  "Redox",
  "Electrochemistry basics",
  "Periodic trends",
  "Bonding",
  "Solubility",
  "Cell membranes",
  "Transport across membranes",
  "Organelles",
  "DNA replication",
  "Transcription and translation",
  "Mendelian genetics",
  "Learning",
  "Memory",
  "Attention",
  "Social psychology",
  "CARS main idea",
  "CARS reasoning within the text",
  "CARS reasoning beyond the text",
]);

const PREVIEW_LIGHTLY = new Set([
  "Amino acids",
  "Protein structure",
  "Enzyme basics",
  "Cell signaling",
  "Organ systems overview",
  "Metabolism overview",
  "Sociology theories",
  "Health disparities",
  "Social inequality",
]);

const DELAY_UNTIL_COURSEWORK = new Set([
  "Advanced biochemistry pathways",
  "Detailed metabolism",
  "Organic synthesis",
  "Alpha carbon chemistry",
  "Aldehydes and ketones",
  "Carboxylic acid derivatives",
  "Advanced physics mechanics",
  "Circuits",
  "Magnetism",
  "Optics",
  "NMR depth",
]);

const CARS_ALWAYS = new Set([
  "CARS main idea",
  "CARS reasoning within the text",
  "CARS reasoning beyond the text",
  "CARS tone and author attitude",
  "CARS evidence mapping",
]);

const COURSE_UNITS: Array<{ unit: string; topics: string[] }> = [
  {
    unit: "Welcome and how to use the course",
    topics: ["MCAT course orientation", "Foundation Builder setup", "Mistake review workflow"],
  },
  {
    unit: "Biological and Biochemical Practice Passages",
    topics: ["Biology passage reading", "Experimental design in biology", "Graph interpretation in bio passages"],
  },
  {
    unit: "Chemical and Physical Practice Passages",
    topics: ["Chemistry passage setup", "Equation selection", "Unit analysis in passages"],
  },
  {
    unit: "Psychological Social and Biological Foundations of Behavior Practice Passages",
    topics: ["Psychology passage setup", "Study design in psych passages", "Correlation vs causation"],
  },
  {
    unit: "CARS Practice",
    topics: [
      "CARS main idea",
      "CARS reasoning within the text",
      "CARS reasoning beyond the text",
      "CARS tone and author attitude",
      "CARS evidence mapping",
    ],
  },
  {
    unit: "Biomolecules",
    topics: [
      "Amino acids",
      "Protein structure",
      "Enzyme basics",
      "Metabolism overview",
      "Advanced biochemistry pathways",
      "Detailed metabolism",
    ],
  },
  {
    unit: "Cells",
    topics: [
      "Cell membranes",
      "Transport across membranes",
      "Organelles",
      "Cell signaling",
      "Cell cycle",
      "DNA replication",
      "Transcription and translation",
      "Mendelian genetics",
    ],
  },
  {
    unit: "Organ Systems",
    topics: [
      "Organ systems overview",
      "Nervous system overview",
      "Endocrine system overview",
      "Circulatory system overview",
      "Immune system overview",
    ],
  },
  {
    unit: "Physical Processes",
    topics: [
      "Advanced physics mechanics",
      "Fluids overview",
      "Waves overview",
      "Circuits",
      "Magnetism",
      "Optics",
    ],
  },
  {
    unit: "Chemical Processes",
    topics: [
      "Acid base chemistry",
      "Buffers",
      "Titrations",
      "Equilibrium",
      "Stoichiometry",
      "Redox",
      "Electrochemistry basics",
      "Periodic trends",
      "Bonding",
      "Solubility",
      "Organic synthesis",
      "Alpha carbon chemistry",
      "Aldehydes and ketones",
      "Carboxylic acid derivatives",
      "NMR depth",
    ],
  },
  {
    unit: "Processing the Environment",
    topics: ["Attention", "Sensation and perception", "Consciousness", "Language processing"],
  },
  {
    unit: "Behavior",
    topics: ["Learning", "Memory", "Motivation", "Emotion", "Stress and coping"],
  },
  {
    unit: "Individuals and Society",
    topics: ["Social psychology", "Identity and self-concept", "Demographics", "Social interaction"],
  },
  {
    unit: "Society and Culture",
    topics: ["Sociology theories", "Culture", "Social structures", "Institutions"],
  },
  {
    unit: "Social Inequality",
    topics: ["Health disparities", "Social inequality", "Social class", "Discrimination"],
  },
];

export const MCAT_TUTOR_PROMPT = `You are my MCAT foundation tutor.

I am a rising sophomore after freshman year. I have taken mostly General Chemistry and some intro psychology or science material. Do not assume I know Organic Chemistry, Physics, Biochemistry, or advanced Biology yet.

Today's topic:
Current status:
Priority label:
Questions attempted:
Questions correct:
Mistake types:
Confidence before:
Confidence after:
Notes:

Teach this topic using active learning.

Rules:
1. Explain the concept simply first.
2. Build the deeper mechanism.
3. Show formulas only when needed.
4. Ask me questions one at a time.
5. Wait for my answer before moving on.
6. Correct my reasoning.
7. Separate never learned from forgotten from concept gap from reasoning error.
8. End with 5 flashcards in Front::Back format.
9. Give me one dashboard entry suggestion.`;

export const MCAT_WEEKLY_REVIEW_PROMPT = `Here is my MCAT Foundation OS weekly data:

Topics studied:
Sessions completed:
Minutes studied:
Questions attempted:
Questions correct:
Accuracy:
Mistake types:
CARS passages:
Flashcards made:
Retests completed:
Topics upgraded:
Topics still weak:

Analyze my week.
Find the highest leverage bottleneck.
Tell me what to study next week.
Tell me what to ignore.
Create a 5 to 7 hour MCAT foundation schedule.`;

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, value));
}

function priorityForTopic(unit: string, title: string): McatPriorityLabel {
  if (CARS_ALWAYS.has(title)) return "CARS Always Available";
  if (STUDY_NOW.has(title)) return "Study Now";
  if (PREVIEW_LIGHTLY.has(title)) return "Preview Lightly";
  if (DELAY_UNTIL_COURSEWORK.has(title)) return "Delay Until Coursework";
  if (unit.includes("Practice Passages")) return "Passage Practice Later";
  return "Preview Lightly";
}

function buildTopic(unit: string, title: string): McatTopic {
  const priorityLabel = priorityForTopic(unit, title);
  const isStudyNow = priorityLabel === "Study Now";
  const isPreview = priorityLabel === "Preview Lightly";
  const isDelay = priorityLabel === "Delay Until Coursework";
  const isPassageLater = priorityLabel === "Passage Practice Later";
  const isCarsAlways = priorityLabel === "CARS Always Available";
  const isChemFoundation = unit === "Chemical Processes" && STUDY_NOW.has(title);
  const isCellFoundation = unit === "Cells" && STUDY_NOW.has(title);
  const isPsychFoundation =
    (unit === "Processing the Environment" ||
      unit === "Behavior" ||
      unit === "Individuals and Society") &&
    STUDY_NOW.has(title);

  return {
    id: `${slug(unit)}-${slug(title)}`,
    unit,
    title,
    status: "Not learned yet",
    priorityLabel,
    foundationFit: isChemFoundation ? 10 : isCarsAlways ? 8 : isStudyNow ? 8 : isPreview ? 7 : isDelay ? 2 : 4,
    yieldScore: isChemFoundation ? 9 : isStudyNow || isCarsAlways ? 8 : isPreview ? 6 : isDelay ? 7 : isPassageLater ? 6 : 5,
    weakness: isChemFoundation ? 6 : isCellFoundation ? 7 : isStudyNow ? 7 : isCarsAlways ? 6 : isPreview ? 5 : isDelay ? 8 : 4,
    courseworkAlignment: isChemFoundation
      ? 10
      : isCellFoundation || isPsychFoundation
        ? 7
        : isCarsAlways
          ? 9
          : isStudyNow
            ? 8
            : isPreview
              ? 5
              : isDelay
                ? 2
                : 4,
    retestUrgency: isStudyNow || isCarsAlways ? 5 : 2,
    courseworkDelayPenalty: isDelay ? 7 : isPassageLater ? 3 : 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
    explanationConfidence: 3,
    retestSuccess: 0,
    flashcardsDue: 0,
    lastReviewed: null,
    lastRetested: null,
  };
}

export function getSeedMcatTopics() {
  return COURSE_UNITS.flatMap(({ unit, topics }) =>
    topics.map((topic) => buildTopic(unit, topic)),
  );
}

export function createDefaultMcatFoundationState(): McatFoundationState {
  return {
    stage: "Foundation Builder",
    topics: getSeedMcatTopics(),
    sessions: [],
    errors: [],
    carsEntries: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(state: McatFoundationState): McatFoundationState {
  const seeded = getSeedMcatTopics();
  const existingById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const topics = seeded.map((topic) => {
    const existing = existingById.get(topic.id);
    if (!existing) return topic;
    const hasUserProgress =
      existing.questionsAttempted > 0 || Boolean(existing.lastReviewed) || Boolean(existing.lastRetested);

    return {
      ...topic,
      status: existing.status ?? topic.status,
      weakness: hasUserProgress ? existing.weakness : topic.weakness,
      retestUrgency: hasUserProgress ? existing.retestUrgency : topic.retestUrgency,
      questionsAttempted: existing.questionsAttempted ?? topic.questionsAttempted,
      questionsCorrect: existing.questionsCorrect ?? topic.questionsCorrect,
      explanationConfidence: existing.explanationConfidence ?? topic.explanationConfidence,
      retestSuccess: existing.retestSuccess ?? topic.retestSuccess,
      flashcardsDue: existing.flashcardsDue ?? topic.flashcardsDue,
      lastReviewed: existing.lastReviewed ?? topic.lastReviewed,
      lastRetested: existing.lastRetested ?? topic.lastRetested,
    };
  });
  return {
    stage: "Foundation Builder",
    topics,
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    errors: Array.isArray(state.errors) ? state.errors : [],
    carsEntries: Array.isArray(state.carsEntries) ? state.carsEntries : [],
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

export function loadMcatFoundationState(): McatFoundationState {
  if (typeof window === "undefined") return createDefaultMcatFoundationState();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultMcatFoundationState();

  try {
    return normalizeState(JSON.parse(raw) as McatFoundationState);
  } catch {
    return createDefaultMcatFoundationState();
  }
}

export function saveMcatFoundationState(state: McatFoundationState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
  );
}

export function calculateMcatStudyPriority(input: {
  foundationFit: number;
  yieldScore: number;
  weakness: number;
  courseworkAlignment: number;
  retestUrgency: number;
}) {
  return round(
    input.foundationFit * 0.3 +
      input.yieldScore * 0.25 +
      input.weakness * 0.2 +
      input.courseworkAlignment * 0.15 +
      input.retestUrgency * 0.1,
  );
}

export function calculateTopicMastery(input: {
  accuracyScore: number;
  explanationConfidence: number;
  retestSuccess: number;
  timeSinceLastReviewScore: number;
}) {
  return round(
    input.accuracyScore * 0.35 +
      input.explanationConfidence * 0.25 +
      input.retestSuccess * 0.25 +
      input.timeSinceLastReviewScore * 0.15,
  );
}

export function calculateRetestPriority(input: {
  weakness: number;
  daysSinceReviewScore: number;
  yieldScore: number;
  confidenceGap: number;
}) {
  return round(
    input.weakness * 0.4 +
      input.daysSinceReviewScore * 0.25 +
      input.yieldScore * 0.25 +
      input.confidenceGap * 0.1,
  );
}

export function calculateCarsRisk(input: {
  mainIdeaMisses: number;
  evidenceErrors: number;
  outOfScopeErrors: number;
  toneErrors: number;
}) {
  return round(
    input.mainIdeaMisses * 0.35 +
      input.evidenceErrors * 0.25 +
      input.outOfScopeErrors * 0.2 +
      input.toneErrors * 0.2,
  );
}

export function calculateStudyDecision(input: {
  mcatStudyPriority: number;
  retestPriority: number;
  courseworkDelayPenalty: number;
}) {
  return round(input.mcatStudyPriority + input.retestPriority - input.courseworkDelayPenalty);
}

function daysSince(dateKey: string | null, today = new Date()) {
  if (!dateKey) return 30;
  const start = new Date(`${dateKey}T00:00:00`);
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function timeSinceLastReviewScore(topic: McatTopic, today = new Date()) {
  const days = daysSince(topic.lastReviewed, today);
  if (!topic.lastReviewed) return 2;
  if (days <= 2) return 10;
  if (days <= 7) return 8;
  if (days <= 14) return 6;
  if (days <= 30) return 4;
  return 2;
}

function daysSinceReviewScore(topic: McatTopic, today = new Date()) {
  const days = daysSince(topic.lastReviewed, today);
  if (!topic.lastReviewed) return 8;
  if (days <= 2) return 2;
  if (days <= 7) return 4;
  if (days <= 14) return 7;
  return 9;
}

export function scoreMcatTopic(topic: McatTopic, today = new Date()): McatTopicScores {
  const accuracyScore =
    topic.questionsAttempted > 0
      ? (topic.questionsCorrect / topic.questionsAttempted) * 10
      : topic.status === "Not learned yet"
        ? 1
        : 4;
  const confidenceGap = clampScore(10 - topic.explanationConfidence);
  const mcatStudyPriority = calculateMcatStudyPriority({
    foundationFit: topic.foundationFit,
    yieldScore: topic.yieldScore,
    weakness: topic.weakness,
    courseworkAlignment: topic.courseworkAlignment,
    retestUrgency: topic.retestUrgency,
  });
  const topicMastery = calculateTopicMastery({
    accuracyScore,
    explanationConfidence: topic.explanationConfidence,
    retestSuccess: topic.retestSuccess,
    timeSinceLastReviewScore: timeSinceLastReviewScore(topic, today),
  });
  const retestPriority = calculateRetestPriority({
    weakness: topic.weakness,
    daysSinceReviewScore: daysSinceReviewScore(topic, today),
    yieldScore: topic.yieldScore,
    confidenceGap,
  });
  const studyDecision = calculateStudyDecision({
    mcatStudyPriority,
    retestPriority,
    courseworkDelayPenalty: topic.courseworkDelayPenalty,
  });

  return {
    topic,
    mcatStudyPriority,
    topicMastery,
    retestPriority,
    studyDecision,
  };
}

function isThisWeek(dateKey: string, today = new Date()) {
  return new Date(`${dateKey}T00:00:00`) >= getWeekStartDate(today);
}

function previousWeekWindow(today = new Date()) {
  const end = getWeekStartDate(today);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function countTypes(items: AnyMcatErrorType[]) {
  return items.reduce<Record<string, number>>((counts, type) => {
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

export function getMcatSummary(state: McatFoundationState, today = new Date()): McatSummary {
  const topicById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const scoredTopics = state.topics
    .map((topic) => scoreMcatTopic(topic, today))
    .sort((a, b) => b.studyDecision - a.studyDecision);
  const activeTopics = scoredTopics.filter(
    ({ topic }) => topic.priorityLabel !== "Delay Until Coursework",
  );
  const sessionsThisWeek = state.sessions.filter((session) => isThisWeek(session.date, today));
  const errorsThisWeek = state.errors.filter((error) => isThisWeek(error.date, today));
  const { start, end } = previousWeekWindow(today);
  const previousSessions = state.sessions.filter((session) => {
    const sessionDate = new Date(`${session.date}T00:00:00`);
    return sessionDate >= start && sessionDate < end;
  });

  const questionsAttempted = sessionsThisWeek.reduce(
    (sum, session) => sum + session.questionsAttempted,
    0,
  );
  const questionsCorrect = sessionsThisWeek.reduce(
    (sum, session) => sum + session.questionsCorrect,
    0,
  );
  const previousAttempted = previousSessions.reduce(
    (sum, session) => sum + session.questionsAttempted,
    0,
  );
  const previousCorrect = previousSessions.reduce(
    (sum, session) => sum + session.questionsCorrect,
    0,
  );
  const accuracy = questionsAttempted > 0 ? round((questionsCorrect / questionsAttempted) * 100) : 0;
  const previousAccuracy =
    previousAttempted > 0 ? round((previousCorrect / previousAttempted) * 100) : 0;
  const carsPassageCountThisWeek =
    state.carsEntries
      .filter((entry) => isThisWeek(entry.date, today))
      .reduce((sum, entry) => sum + entry.passages, 0) +
    sessionsThisWeek.filter((session) => topicById.get(session.topicId)?.unit === "CARS Practice")
      .length;
  const carsErrors = [
    ...state.carsEntries.flatMap((entry) => entry.errorTypes),
    ...state.errors
      .filter((error) => topicById.get(error.topicId)?.unit === "CARS Practice")
      .map((error) => error.type),
  ];
  const carsRisk = calculateCarsRisk({
    mainIdeaMisses: carsErrors.filter((type) => type === "Main idea miss").length,
    evidenceErrors: carsErrors.filter((type) => type === "Evidence mismatch").length,
    outOfScopeErrors: carsErrors.filter((type) => type === "Out of scope").length,
    toneErrors: carsErrors.filter((type) => type === "Tone miss").length,
  });

  return {
    scoredTopics,
    currentBestTopic: activeTopics[0]?.topic ?? null,
    weakestTopic: [...state.topics].sort((a, b) => b.weakness - a.weakness)[0] ?? null,
    nextRetest:
      [...scoredTopics]
        .filter(({ topic }) => topic.priorityLabel !== "Delay Until Coursework")
        .sort((a, b) => b.retestPriority - a.retestPriority)[0]?.topic ?? null,
    carsPassageCountThisWeek,
    questionsAttempted,
    questionsCorrect,
    accuracy,
    accuracyTrend: round(accuracy - previousAccuracy),
    flashcardsDue: state.topics.reduce((sum, topic) => sum + topic.flashcardsDue, 0),
    minutesThisWeek: sessionsThisWeek.reduce((sum, session) => sum + session.minutes, 0),
    sessionsThisWeek,
    errorsThisWeek,
    topicsStudiedThisWeek: Array.from(
      new Set(
        sessionsThisWeek
          .map((session) => topicById.get(session.topicId)?.title)
          .filter((title): title is string => Boolean(title)),
      ),
    ),
    mistakeTypeCounts: countTypes([
      ...sessionsThisWeek.flatMap((session) => session.mistakeTypes),
      ...errorsThisWeek.map((error) => error.type),
    ]),
    carsRisk,
  };
}

export function getMcatDailyNextMove(
  state: McatFoundationState,
  context: { academicRisk: number; sleepReadiness: number },
) {
  const summary = getMcatSummary(state);
  const hasMcatData =
    state.sessions.length > 0 || state.errors.length > 0 || state.carsEntries.length > 0;

  if (context.academicRisk >= 8) {
    return {
      title: "Optional maintenance only",
      detail: "Academic risk is high. Keep MCAT to 10 minutes of flashcards if the school task is under control.",
      topic: summary.currentBestTopic?.title ?? "Foundation review",
    };
  }

  if (context.sleepReadiness > 0 && context.sleepReadiness < 5) {
    return {
      title: "Flashcards only",
      detail: "Sleep readiness is below 5. Avoid heavy new content and clear a small flashcard block.",
      topic: summary.nextRetest?.title ?? "Review cards",
    };
  }

  if (!hasMcatData) {
    return {
      title: "Start foundation baseline",
      detail: "No MCAT sessions logged yet. Start with Acid base chemistry or one untimed CARS passage.",
      topic: "Acid base chemistry",
    };
  }

  if (summary.carsPassageCountThisWeek === 0) {
    return {
      title: "One untimed CARS passage",
      detail: "CARS has no weekly reps yet. Do one passage and log the exact miss type.",
      topic: "CARS main idea",
    };
  }

  return {
    title: "Focused topic session",
    detail: `Sleep is usable and academics are not urgent. Study ${summary.currentBestTopic?.title ?? "one foundation topic"} for 35 minutes.`,
    topic: summary.currentBestTopic?.title ?? "Foundation topic",
  };
}

export function getTodayDateKey() {
  return toDateKey(new Date());
}
