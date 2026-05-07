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
    ? "Supabase is not configured. This is a local draft only."
    : "Waiting for Supabase to load before saving.";
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
    return {
      ok: true,
      status: "saved",
      data: await operation(),
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}
