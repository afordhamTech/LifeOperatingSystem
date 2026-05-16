type PersistenceSyncStatus = "local" | "waiting" | "error" | "saved";

type PersistenceReadiness = {
  hasSupabaseConfig: boolean;
  userId: string | null;
  hasLoadedRemote?: boolean;
};

type RunSupabasePersistenceInput<T> = PersistenceReadiness & {
  operation: () => Promise<T>;
};

export type PersistenceResult<T> =
  | {
      ok: true;
      status: Extract<PersistenceSyncStatus, "saved">;
      data: T;
    }
  | {
      ok: false;
      status: Extract<PersistenceSyncStatus, "local" | "waiting" | "error">;
      error: string;
    };

export function getBlockedSyncStatus({
  hasSupabaseConfig,
  userId,
  hasLoadedRemote = true,
}: PersistenceReadiness): Extract<PersistenceSyncStatus, "local" | "waiting"> | null {
  if (!hasSupabaseConfig) return "local";
  if (!userId) return "waiting";
  if (!hasLoadedRemote) return "waiting";
  return null;
}

export function getBlockedSyncMessage(status: Extract<PersistenceSyncStatus, "local" | "waiting">) {
  return status === "local"
    ? "Sign-in is unavailable right now. Changes stay as a local draft."
    : "Loading your saved data before saving changes…";
}

export async function runSupabasePersistence<T>({
  hasSupabaseConfig,
  userId,
  hasLoadedRemote = true,
  operation,
}: RunSupabasePersistenceInput<T>): Promise<PersistenceResult<T>> {
  const blockedStatus = getBlockedSyncStatus({
    hasSupabaseConfig,
    userId,
    hasLoadedRemote,
  });

  if (blockedStatus) {
    return {
      ok: false,
      status: blockedStatus,
      error: getBlockedSyncMessage(blockedStatus),
    };
  }

  try {
    const data = await operation();
    const globalScope = (globalThis as { window?: { dispatchEvent: (e: Event) => boolean } });
    if (globalScope.window?.dispatchEvent) {
      // Notify the canonical AI prompt context that Lifeee data changed so it
      // can refetch. Keeps the prompt drawer in sync after writes from any
      // page without forcing every caller to wire its own invalidation.
      globalScope.window.dispatchEvent(new Event("lifeee:prompt-context-invalidate"));
    }
    return {
      ok: true,
      status: "saved",
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}
