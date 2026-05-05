type SleepReadinessInput = {
  hoursSlept: number;
  sleepQuality: number;
  wakeEnergy: number;
  stressBeforeBed: number;
  targetSleepHours?: number;
};

type AcademicPriorityInput = {
  gradeImpact: number;
  urgency: number;
  difficulty: number;
  timeRequiredScore: number;
};

type TrainingReadinessInput = {
  sleepReadiness: number;
  energy: number;
  soreness: number;
  pain: number;
  motivation?: number;
};

type WeeklyLifeScoreInput = {
  academicsScore: number;
  sleepScore: number;
  trainingScore: number;
  nutritionScore: number;
  careerProofScore: number;
  faithSubstanceScore: number;
  moneyAdminScore: number;
};

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateSleepDebt(
  hoursSlept: number,
  targetSleepHours = 8,
) {
  return roundToTwo(Math.max(0, targetSleepHours - hoursSlept));
}

export function calculateSleepReadiness({
  hoursSlept,
  sleepQuality,
  wakeEnergy,
  stressBeforeBed,
  targetSleepHours = 8,
}: SleepReadinessInput) {
  const actualSleepScore = Math.min(
    10,
    (hoursSlept / targetSleepHours) * 10,
  );
  const lowStressScore = 10 - stressBeforeBed;
  return roundToTwo(
    actualSleepScore * 0.4 +
      sleepQuality * 0.25 +
      wakeEnergy * 0.2 +
      lowStressScore * 0.15,
  );
}

export function calculateAcademicPriorityScore({
  gradeImpact,
  urgency,
  difficulty,
  timeRequiredScore,
}: AcademicPriorityInput) {
  return roundToTwo(
    gradeImpact * 0.35 +
      urgency * 0.3 +
      difficulty * 0.2 +
      timeRequiredScore * 0.15,
  );
}

export function calculateTrainingReadiness({
  sleepReadiness,
  energy,
  soreness,
  pain,
  motivation = 7,
}: TrainingReadinessInput) {
  const sorenessRecovery = 10 - soreness;
  const painSafety = 10 - pain;
  return roundToTwo(
    sleepReadiness * 0.3 +
      energy * 0.2 +
      sorenessRecovery * 0.2 +
      painSafety * 0.2 +
      motivation * 0.1,
  );
}

export function calculateWeeklyLifeScore({
  academicsScore,
  sleepScore,
  trainingScore,
  nutritionScore,
  careerProofScore,
  faithSubstanceScore,
  moneyAdminScore,
}: WeeklyLifeScoreInput) {
  return roundToTwo(
    academicsScore * 0.25 +
      sleepScore * 0.15 +
      trainingScore * 0.15 +
      nutritionScore * 0.1 +
      careerProofScore * 0.15 +
      faithSubstanceScore * 0.1 +
      moneyAdminScore * 0.1,
  );
}
