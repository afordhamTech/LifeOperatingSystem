import { parseTimeToMinutes, type CalendarAnchor, type TimeBlock } from "@/lib/calendar-system";

type TimelineItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  kind: "anchor" | "block";
};

function itemPercent(time: string) {
  return (parseTimeToMinutes(time) / (24 * 60)) * 100;
}

function durationPercent(start: string, end: string) {
  return Math.max(0.4, itemPercent(end) - itemPercent(start));
}

export default function CapacityTimeline({
  anchors,
  timeBlocks,
}: {
  anchors: CalendarAnchor[];
  timeBlocks: TimeBlock[];
}) {
  const items: TimelineItem[] = [
    ...anchors.map((anchor) => ({
      id: anchor.id,
      title: anchor.title,
      start: anchor.start_time,
      end: anchor.end_time,
      kind: "anchor" as const,
    })),
    ...timeBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      start: block.start_time,
      end: block.end_time,
      kind: "block" as const,
    })),
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Capacity timeline</div>
          <div className="text-xs text-muted-foreground">Fixed anchors and scheduled blocks across 24 hours.</div>
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
            className="absolute top-2 h-8 rounded-md px-2 text-[10px] font-medium text-white shadow-sm"
            style={{
              left: `${itemPercent(item.start)}%`,
              width: `${durationPercent(item.start, item.end)}%`,
              backgroundColor: item.kind === "anchor" ? "#c39a4e" : "#6b87ae",
            }}
            title={`${item.title}: ${item.start}-${item.end}`}
            aria-label={`${item.kind} ${item.title} from ${item.start} to ${item.end}`}
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
