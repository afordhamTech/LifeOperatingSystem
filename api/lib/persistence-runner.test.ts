import { describe, expect, it, vi } from "vitest";
import {
  getBlockedSyncStatus,
  runSupabasePersistence,
} from "@/lib/persistence-runner";

describe("persistence runner", () => {
  it("blocks logged-in writes until the first Supabase load gate opens", async () => {
    const operation = vi.fn(async () => "saved");

    const result = await runSupabasePersistence({
      hasSupabaseConfig: true,
      userId: "user-1",
      hasLoadedRemote: false,
      operation,
    });

    expect(result).toEqual({
      ok: false,
      status: "waiting",
      error: "Waiting for Supabase to load before saving.",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns honest statuses for non-Supabase write modes", () => {
    expect(getBlockedSyncStatus({ hasSupabaseConfig: false, userId: null })).toBe("local");
    expect(getBlockedSyncStatus({ hasSupabaseConfig: true, userId: null })).toBe("waiting");
    expect(
      getBlockedSyncStatus({
        hasSupabaseConfig: true,
        userId: "user-1",
        hasLoadedRemote: false,
      }),
    ).toBe("waiting");
  });

  it("runs the operation and marks successful logged-in saves as Supabase saved", async () => {
    const result = await runSupabasePersistence({
      hasSupabaseConfig: true,
      userId: "user-1",
      hasLoadedRemote: true,
      operation: async () => ({ id: "row-1" }),
    });

    expect(result).toEqual({
      ok: true,
      status: "saved",
      data: { id: "row-1" },
    });
  });
});
