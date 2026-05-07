import { useCallback, useState } from "react";
import type { LifeeeSyncStatus } from "@/lib/lifeee-persistence";

export function useSyncStatus(initialStatus: LifeeeSyncStatus = "local") {
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>(initialStatus);
  const [syncError, setSyncError] = useState<string | null>(null);

  const markSaving = useCallback(() => {
    setSyncStatus("saving");
    setSyncError(null);
  }, []);

  const markSaved = useCallback(() => {
    setSyncStatus("saved");
    setSyncError(null);
  }, []);

  const markFailed = useCallback((error: unknown, fallback = "Sync failed.") => {
    setSyncStatus("error");
    setSyncError(error instanceof Error ? error.message : fallback);
  }, []);

  return {
    syncStatus,
    syncError,
    setSyncStatus,
    setSyncError,
    markSaving,
    markSaved,
    markFailed,
  };
}
