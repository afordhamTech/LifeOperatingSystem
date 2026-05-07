import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type PrivacyChipProps = {
  label?: string | null;
  className?: string;
};

export function PrivacyChip({ label, className }: PrivacyChipProps) {
  const value = label?.trim() || "Private";
  const tone =
    value === "Public Proof"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
      : value === "Mentor Shareable"
        ? "border-sky-500/25 bg-sky-500/10 text-sky-700"
        : "border-slate-500/25 bg-slate-500/10 text-slate-700";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <ShieldCheck size={11} />
      {value}
    </span>
  );
}
