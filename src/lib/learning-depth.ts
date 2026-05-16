export type LearningDepthInput = {
  coreIdea?: string;
  question?: string;
  writingPractice?: boolean;
  speakingPractice?: boolean;
  conversationPractice?: boolean;
};

export function calculateLearningDepthScore(input: LearningDepthInput) {
  const score =
    (input.coreIdea?.trim() ? 20 : 0) +
    (input.question?.trim() ? 20 : 0) +
    (input.writingPractice ? 20 : 0) +
    (input.speakingPractice ? 20 : 0) +
    (input.conversationPractice ? 20 : 0);
  return score;
}
