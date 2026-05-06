// ─── Sleep Calculations ───
export function calcSleepReadiness(
  hoursSlept: number,
  sleepQuality: number,
  energyOnWake: number,
  stressLevel: number,
  targetSleep: number = 8
) {
  const actualSleepScore = Math.min(10, (hoursSlept / targetSleep) * 10);
  const lowStressScore = 10 - stressLevel;
  const readiness =
    actualSleepScore * 0.40 +
    sleepQuality * 0.25 +
    energyOnWake * 0.20 +
    lowStressScore * 0.15;
  return {
    score: Math.round(readiness * 100) / 100,
    breakdown: {
      actualSleepScore: Math.round(actualSleepScore * 100) / 100,
      sleepQuality,
      energyOnWake,
      lowStressScore,
    },
  };
}

export function calcSleepDebt(hoursSlept: number, targetSleep: number = 8) {
  return Math.round((targetSleep - hoursSlept) * 100) / 100;
}

// ─── Academics Calculations ───
export function calcAcademicPriority(
  gradeImpact: number,
  daysUntilDue: number,
  difficulty: number,
  estimatedHours: number
) {
  const urgency = Math.max(1, Math.min(10, 10 - daysUntilDue));
  const timeRequired = Math.min(10, estimatedHours);
  const priority =
    gradeImpact * 0.35 +
    urgency * 0.30 +
    difficulty * 0.20 +
    timeRequired * 0.15;
  return Math.round(priority * 100) / 100;
}

// ─── Workout Calculations ───
export function calcTrainingReadiness(
  sleepReadiness: number,
  energy: number,
  soreness: number,
  pain: number,
  motivation: number = 7
) {
  const sorenessRecovery = 10 - soreness;
  const painSafety = 10 - pain;
  const readiness =
    sleepReadiness * 0.30 +
    energy * 0.20 +
    sorenessRecovery * 0.20 +
    painSafety * 0.20 +
    motivation * 0.10;
  return Math.round(readiness * 100) / 100;
}

export function getWorkoutDecision(readiness: number, pain: number) {
  if (pain > 6) return { decision: "STOP", label: "Stop — Pain too high", color: "#c97a73" as const };
  if (readiness >= 8) return { decision: "FULL", label: "Full Workout", color: "#6a9a74" as const };
  if (readiness >= 6.5) return { decision: "NORMAL", label: "Normal Day", color: "#6b87ae" as const };
  if (readiness >= 5) return { decision: "LIGHT", label: "Light Day", color: "#c39a4e" as const };
  return { decision: "RECOVERY", label: "Recovery Day", color: "#6b87ae" as const };
}

// ─── Nutrition Calculations ───
export function calcNutritionStatus(
  caloriesEaten: number,
  protein: number,
  waterGlasses: number,
  mealsEaten: number,
  bodyweight: number = 150,
  targetCalories: number = 2500
) {
  const caloriesHit = caloriesEaten >= targetCalories * 0.9 && caloriesEaten <= targetCalories * 1.1;
  const proteinHit = protein >= bodyweight * 0.8;
  const waterHit = waterGlasses >= 6;
  const timingOk = mealsEaten >= 3;

  let checks = 0;
  if (caloriesHit) checks++;
  if (proteinHit) checks++;
  if (waterHit) checks++;
  if (timingOk) checks++;

  let status: string;
  if (checks === 4) status = "green";
  else if (checks >= 2) status = "yellow";
  else status = "red";

  return { caloriesHit, proteinHit, waterHit, timingOk, status, checks };
}

// ─── Career Calculations ───
export function calcProofScore(
  visibility: number,
  difficulty: number,
  relevance: number,
  completion: number
) {
  return Math.round((visibility * 0.25 + difficulty * 0.25 + relevance * 0.25 + completion * 0.25) * 100) / 100;
}

// ─── Weekly Life Score ───
export function calcWeeklyLifeScore(
  academics: number,
  sleep: number,
  training: number,
  nutrition: number,
  career: number,
  faith: number,
  money: number
) {
  return Math.round(
    (academics * 0.25 +
      sleep * 0.15 +
      training * 0.15 +
      nutrition * 0.10 +
      career * 0.15 +
      faith * 0.10 +
      money * 0.10) *
      100
  ) / 100;
}

// ─── Faith Score ───
export function calcFaithScore(prayerDone: boolean, bibleReading: string | null, mainLesson: string | null, actionStep: string | null) {
  const prayer = prayerDone ? 0.30 : 0;
  const bible = bibleReading ? 0.30 : 0;
  const reflection = mainLesson ? 0.20 : 0;
  const action = actionStep ? 0.20 : 0;
  return Math.round((prayer + bible + reflection + action) * 100);
}

// ─── Substance Score ───
export function calcSubstanceScore(
  readingDone: string | null,
  notesTaken: string | null,
  writingPractice: boolean,
  speakingPractice: boolean,
  newConcept: string | null
) {
  const reading = readingDone ? 0.25 : 0;
  const reflection = notesTaken ? 0.25 : 0;
  const writing = writingPractice ? 0.20 : 0;
  const speaking = speakingPractice ? 0.20 : 0;
  const newIdea = newConcept ? 0.10 : 0;
  return Math.round((reading + reflection + writing + speaking + newIdea) * 100) / 100;
}

// ─── Health / Injury Risk ───
export function calcInjuryRisk(
  painScore: number,
  painTrend: string,
  trainingLoad: number = 5,
  recoveryDeficit: number = 3
) {
  const trendScore = painTrend === "increasing" ? 8 : painTrend === "stable" ? 5 : 2;
  const risk = painScore * 0.40 + trendScore * 0.25 + trainingLoad * 0.20 + recoveryDeficit * 0.15;
  return Math.round(risk * 100) / 100;
}
