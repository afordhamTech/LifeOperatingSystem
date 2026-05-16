import { describe, expect, it } from "vitest";
import { parseTaskTitleInput } from "@/lib/task-nlp-parser";

describe("parseTaskTitleInput", () => {
  const base = new Date("2026-05-15T12:00:00");

  it("extracts category, priority, estimate, and tomorrow", () => {
    const parsed = parseTaskTitleInput(
      "Review MCAT flashcards tomorrow for 30m #Academic !high",
      base,
    );

    expect(parsed.cleanedTitle).toBe("Review MCAT flashcards");
    expect(parsed.taskType).toBe("Academic");
    expect(parsed.priority).toBe("high");
    expect(parsed.estimatedMinutes).toBe(30);
    expect(parsed.dueDate).toBe("2026-05-16");
  });

  it("extracts fixed time and hour estimates", () => {
    const parsed = parseTaskTitleInput("Write essay Friday at 3pm for 1h !critical", base);

    expect(parsed.cleanedTitle).toBe("Write essay");
    expect(parsed.fixedTime).toBe("15:00");
    expect(parsed.estimatedMinutes).toBe(60);
    expect(parsed.dueDate).toBe("2026-05-22");
    expect(parsed.priority).toBe("critical");
  });
});
