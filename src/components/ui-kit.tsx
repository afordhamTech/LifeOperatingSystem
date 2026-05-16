import { useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUIMode } from "@/providers/UIModeContext";

/**
 * Shared UI kit for Phase 2B compression. Minimal, reusable building blocks
 * that reduce repetition and make every page answer "what should I do next?".
 */

/** Page header that leads with the key decision, not a database title. */
export function PageDecisionHeader({
  title,
  question,
  children,
}: {
  title: string;
  question?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {question ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{question}</p>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** The single most important "do this next" card on a page. */
export function NextActionCard({
  label = "Next action",
  title,
  detail,
  action,
  tone = "primary",
}: {
  label?: string;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  tone?: "primary" | "warning" | "calm";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300/70 bg-amber-50/60"
      : tone === "calm"
        ? "border-border bg-muted/40"
        : "border-primary/30 bg-primary/5";
  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground">{title}</div>
      {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** A small interpreted insight: status + meaning + reason + next step. */
export function InsightCard({
  label,
  value,
  interpretation,
  reason,
  nextAction,
  className,
}: {
  label: string;
  value?: ReactNode;
  interpretation?: ReactNode;
  reason?: ReactNode;
  nextAction?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {value ? <span className="text-sm font-semibold text-foreground">{value}</span> : null}
      </div>
      {interpretation ? (
        <div className="mt-1 text-sm text-foreground/90">{interpretation}</div>
      ) : null}
      {reason ? <div className="mt-0.5 text-xs text-muted-foreground">{reason}</div> : null}
      {nextAction ? (
        <div className="mt-2 text-xs font-medium text-primary">{nextAction}</div>
      ) : null}
    </div>
  );
}

/** Collapsible section with a clear toggle. */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span>
          <span className="text-sm font-medium text-foreground">{title}</span>
          {subtitle ? (
            <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3 transition-all duration-200">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export const SectionToggle = CollapsibleSection;

/**
 * Content that only renders in Advanced mode, or as a collapsible "details"
 * block in Simple mode when `alwaysCollapsible` is set.
 */
export function AdvancedDetails({
  title = "Advanced details",
  children,
  alwaysShow = false,
}: {
  title?: string;
  children: ReactNode;
  alwaysShow?: boolean;
}) {
  const { isAdvanced } = useUIMode();
  if (!isAdvanced && !alwaysShow) {
    return (
      <CollapsibleSection title={title} className="mt-3">
        {children}
      </CollapsibleSection>
    );
  }
  return <div className="mt-3">{children}</div>;
}

/** Renders children only in Advanced mode. */
export function AdvancedOnly({ children }: { children: ReactNode }) {
  const { isAdvanced } = useUIMode();
  return isAdvanced ? <>{children}</> : null;
}

/** Renders children only in Simple mode. */
export function SimpleOnly({ children }: { children: ReactNode }) {
  const { isSimple } = useUIMode();
  return isSimple ? <>{children}</> : null;
}

/** Actionable empty state: what's missing, smallest next action, why it matters. */
export function EmptyStateCard({
  missing,
  nextAction,
  why,
  action,
  className,
}: {
  missing: string;
  nextAction?: string;
  why?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center",
        className,
      )}
    >
      <div className="text-sm font-medium text-foreground">{missing}</div>
      {nextAction ? (
        <div className="mt-1 text-xs text-foreground/80">{nextAction}</div>
      ) : null}
      {why ? <div className="mt-1 text-xs text-muted-foreground">{why}</div> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Generic object card with one primary action and a "More" slot. */
export function ObjectCard({
  title,
  meta,
  badge,
  primaryAction,
  more,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  primaryAction?: ReactNode;
  more?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            {badge}
          </div>
          {meta ? <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
          {children}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {primaryAction}
          {more}
        </div>
      </div>
    </div>
  );
}

/** Segmented control for page modes (Capture / Plan / Review etc.). */
export function SegmentedModeTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Small status pill with semantic tone. */
export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClass = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-sky-100 text-sky-700",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Sticky-ish bar for the page's primary actions. */
export function PrimaryActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Button styled for "do this with AI" actions. */
export function AIActionButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={className}>
      <Sparkles size={14} className="mr-1.5" />
      {children}
    </Button>
  );
}
