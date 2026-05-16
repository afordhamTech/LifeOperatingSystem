import { parseTimeToMinutes, type CalendarAnchor, type TimeBlock } from "@/lib/calendar-system";
import type { Task } from "@/lib/task-system";

type TimelineItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  kind: "anchor" | "block";
  tooltip: string;
};

function itemPercent(time: string) {
  return (parseTimeToMinutes(time) / (24 * 60)) * 100;
}

function durationPercent(start: string, end: string) {
  return Math.max(0.4, itemPercent(end) - itemPercent(start));
}

function buildAnchorTooltip(anchor: CalendarAnchor): string {
  const lines: string[] = [
    `${anchor.title}  (${anchor.start_time}–${anchor.end_time})`,
    `Anchor · ${anchor.category}`,
  ];
  if (anchor.location) lines.push(`Location: ${anchor.location}`);
  if (anchor.people) lines.push(`People: ${anchor.people}`);
  if (anchor.prep) lines.push(`Prep: ${anchor.prep}`);
  if (anchor.follow_up) lines.push(`Follow-up: ${anchor.follow_up}`);
  if (anchor.notes) lines.push(`Notes: ${anchor.notes}`);
  return lines.join("\n");
}

function buildBlockTooltip(block: TimeBlock, task: Task | undefined): string {
  const lines: string[] = [
    `${block.title}  (${block.start_time}–${block.end_time})`,
    `Block · ${block.block_type}${block.source ? ` · ${block.source}` : ""}`,
    `Status: ${block.status}${
      block.execution_status && block.execution_status !== "not_started"
        ? ` · ${block.execution_status}`
        : ""
    }`,
  ];
  if (task?.task_code) lines.push(`Task: ${task.task_code} · ${task.title}`);
  if (block.reason) lines.push(`Reason: ${block.reason}`);
  if (block.notes) lines.push(`Notes: ${block.notes}`);
  if (block.execution_notes) lines.push(`Execution: ${block.execution_notes}`);
  if (block.missed_reason) lines.push(`Missed: ${block.missed_reason}`);
  return lines.join("\n");
}

export default function CapacityTimeline({
  anchors,
  timeBlocks,
  tasks,
}: {
  anchors: CalendarAnchor[];
  timeBlocks: TimeBlock[];
  tasks?: Task[];
}) {
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const items: TimelineItem[] = [
    ...anchors.map((anchor) => ({
      id: anchor.id,
      title: anchor.title,
      start: anchor.start_time,
      end: anchor.end_time,
      kind: "anchor" as const,
      tooltip: buildAnchorTooltip(anchor),
    })),
    ...timeBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      start: block.start_time,
      end: block.end_time,
      kind: "block" as const,
      tooltip: buildBlockTooltip(
        block,
        block.linked_task_id ? taskById.get(block.linked_task_id) : undefined,
      ),
    })),
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Capacity timeline</div>
          <div className="text-xs text-muted-foreground">Fixed anchors and scheduled blocks across 24 hours. Hover a pill for details.</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#6b87ae]" /> Block
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#c39a4e]" /> Anchor
          </span>
        </div>
      </div>
      <div
        className="relative h-12 overflow-hidden rounded-lg border border-[#e3d8c9] bg-[#f8f3ea]"
        aria-label="24-hour capacity timeline. Empty space represents open time."
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="absolute top-0 h-full border-l border-[#e3d8c9]/70"
            style={{ left: `${(index / 6) * 100}%` }}
          />
        ))}
        {items.map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            className="absolute top-2 h-8 cursor-help rounded-md px-2 text-[10px] font-medium text-white shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md"
            style={{
              left: `${itemPercent(item.start)}%`,
              width: `${durationPercent(item.start, item.end)}%`,
              backgroundColor: item.kind === "anchor" ? "#c39a4e" : "#6b87ae",
            }}
            title={item.tooltip}
            aria-label={item.tooltip}
          >
            <span className="block truncate">{item.title}</span>
            <span className="block truncate opacity-80">
              {item.start}-{item.end}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
