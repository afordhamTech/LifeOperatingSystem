import { describe, expect, it } from "vitest";
import { DEFAULT_MEAL_TEMPLATES, chooseNextFoodFix } from "@/lib/nutrition-helpers";

describe("chooseNextFoodFix", () => {
  it("chooses a close meal template for remaining macros", () => {
    const fix = chooseNextFoodFix(DEFAULT_MEAL_TEMPLATES, { calories: 650, proteinG: 38 });
    expect(fix.template?.name).toBe("Whey smoothie + bagel");
  });

  it("returns a fallback when no templates exist", () => {
    expect(chooseNextFoodFix([], { calories: 500, proteinG: 40 }).template).toBeNull();
  });
});
