import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function deriveDailyOpMode(realityScore: number, energy: number, sleepReadiness: number) {
  if (sleepReadiness > 0 && sleepReadiness < 5) return "Recovery";
  if (realityScore < 5 || energy < 4) return "Triage";
  if (realityScore >= 7 && energy >= 7) return "Attack";
  return "Steady";
}

type DailyOpModeChipProps = {
  mode: string;
  className?: string;
};

export function DailyOpModeChip({ mode, className }: DailyOpModeChipProps) {
  const tone =
    mode === "Attack"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
      : mode === "Recovery"
        ? "border-sky-500/25 bg-sky-500/10 text-sky-700"
        : mode === "Triage"
          ? "border-rose-500/25 bg-rose-500/10 text-rose-700"
          : "border-amber-500/25 bg-amber-500/10 text-amber-700";

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold", tone, className)}>
      <Activity size={12} />
      {mode} mode
    </span>
  );
}
