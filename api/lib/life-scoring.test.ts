import { describe, expect, it } from "vitest";
import {
  calculateAcademicPriorityScore,
  calculateSleepDebt,
  calculateSleepReadiness,
  calculateTrainingReadiness,
  calculateWeeklyLifeScore,
} from "@/lib/life-scoring";

describe("life scoring helpers", () => {
  it("calculates sleep debt and readiness from the provided inputs", () => {
    expect(calculateSleepDebt(6.5)).toBe(1.5);
    expect(
      calculateSleepReadiness({
        hoursSlept: 8,
        sleepQuality: 5,
        wakeEnergy: 5,
        stressBeforeBed: 5,
      }),
    ).toBe(7);
  });

  it("calculates academic priority using urgency, difficulty, and estimated time", () => {
    expect(
      calculateAcademicPriorityScore({
        gradeImpact: 8,
        urgency: 8,
        difficulty: 6,
        timeRequiredScore: 4,
      }),
    ).toBe(7);
  });

  it("calculates training readiness from sleep, energy, soreness, pain, and motivation", () => {
    expect(
      calculateTrainingReadiness({
        sleepReadiness: 7,
        energy: 7,
        soreness: 4,
        pain: 2,
        motivation: 8,
      }),
    ).toBe(7.1);
  });

  it("calculates weekly life score from the supplied module scores", () => {
    expect(
      calculateWeeklyLifeScore({
        academicsScore: 8,
        sleepScore: 8,
        trainingScore: 8,
        nutritionScore: 8,
        careerProofScore: 8,
        faithSubstanceScore: 8,
        moneyAdminScore: 8,
      }),
    ).toBe(8);
  });
});
