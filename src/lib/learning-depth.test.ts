import { describe, expect, it } from "vitest";
import { calculateLearningDepthScore } from "@/lib/learning-depth";

describe("calculateLearningDepthScore", () => {
  it("scores five equal factors", () => {
    expect(
      calculateLearningDepthScore({
        coreIdea: "Deliberate practice needs feedback",
        question: "What feedback matters?",
        writingPractice: true,
        speakingPractice: true,
        conversationPractice: false,
      }),
    ).toBe(80);
  });
});
