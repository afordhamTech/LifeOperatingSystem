import { getSyncLabel, getSyncTone, type LifeeeSyncStatus } from "@/lib/lifeee-persistence";
import { cn } from "@/lib/utils";

type SyncBadgeProps = {
  status: LifeeeSyncStatus;
  className?: string;
};

export function SyncBadge({ status, className }: SyncBadgeProps) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", getSyncTone(status), className)}>
      {getSyncLabel(status)}
    </span>
  );
}
