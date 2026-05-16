export type MealTemplate = {
  id?: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const DEFAULT_MEAL_TEMPLATES: MealTemplate[] = [
  { name: "Whey smoothie + bagel", calories: 600, proteinG: 40, carbsG: 80, fatG: 12 },
  { name: "Rice/chicken meal", calories: 800, proteinG: 50, carbsG: 90, fatG: 18 },
  { name: "Protein shake", calories: 180, proteinG: 28, carbsG: 8, fatG: 3 },
  { name: "Dining hall meal", calories: 750, proteinG: 35, carbsG: 85, fatG: 22 },
  { name: "Peanut butter smoothie", calories: 700, proteinG: 30, carbsG: 70, fatG: 28 },
];

export function chooseNextFoodFix(
  templates: MealTemplate[],
  remaining: { calories: number; proteinG: number },
) {
  if (templates.length === 0) {
    return {
      template: null,
      label: "Build one protein + carb meal from what is available.",
      reason: "No meal templates exist yet.",
    };
  }

  const targetCalories = Math.max(0, remaining.calories);
  const targetProtein = Math.max(0, remaining.proteinG);
  const [best] = [...templates].sort((a, b) => {
    const score = (template: MealTemplate) => {
      const calorieDelta = Math.abs(targetCalories - template.calories);
      const proteinDelta = Math.abs(targetProtein - template.proteinG) * 12;
      const overPenalty =
        (template.calories > targetCalories + 250 ? 300 : 0) +
        (template.proteinG > targetProtein + 30 ? 120 : 0);
      return calorieDelta + proteinDelta + overPenalty;
    };
    return score(a) - score(b);
  });

  return {
    template: best,
    label: `${best.name} (${best.calories} cal, ${best.proteinG}g protein)`,
    reason: "Closest match to remaining calories and protein.",
  };
}
