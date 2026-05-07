import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center",
        className,
      )}
    >
      <Inbox size={20} className="text-muted-foreground" />
      <div className="mt-2 text-sm font-medium text-foreground">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
