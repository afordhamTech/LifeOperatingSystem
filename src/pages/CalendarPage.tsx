import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ListChecks,
  Plus,
  Trash2,
  Copy,
  CheckCheck,
  AlertTriangle,
  Clock,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";
import {
  ANCHOR_CATEGORIES,
  PRIVACY_LEVELS,
  type AnchorCategory,
  type CalendarAnchor,
  type PrivacyLevel,
  CATEGORY_COLORS,
  loadAnchors,
  saveAnchors,
  makeAnchor,
  parseTimeToMinutes,
  minutesToTime,
  anchorDuration,
  calculateAvailableTime,
  buildTodayTimeline,
  detectConflicts,
  buildCalendarPlanningPrompt,
  buildWeeklyCalendarReviewPrompt,
  calculateRealityScore,
  listRecurringLoops,
} from "@/lib/calendar-system";
import { buildDayPlan, loadTasks, type Task } from "@/lib/task-system";
import { toDateKey } from "@/lib/date-helpers";

type View = "today" | "week" | "month" | "agenda";

const VIEW_TABS: { key: View; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "week", label: "Week", icon: CalendarRange },
  { key: "month", label: "Month", icon: CalendarDays },
  { key: "agenda", label: "Agenda", icon: ListChecks },
];

function readEnergy(): number {
  if (typeof window === "undefined") return 7;
  try {
    const raw = window.localStorage.getItem("lifeee.daily.energy");
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    // ignore
  }
  return 7;
}

export default function CalendarPage() {
  const today = useMemo(() => toDateKey(), []);
  const [anchors, setAnchors] = useState<CalendarAnchor[]>(() => loadAnchors());
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [view, setView] = useState<View>("today");
  const [activeDate, setActiveDate] = useState<string>(today);
  const [currentEnergy] = useState<number>(readEnergy());
  const [copied, setCopied] = useState<string | null>(null);

  const [draft, setDraft] = useState<Omit<CalendarAnchor, "id" | "created_at" | "updated_at">>({
    title: "",
    date: today,
    start_time: "09:00",
    end_time: "10:00",
    category: "Personal",
    location: "",
    link: "",
    people: "",
    prep: "",
    follow_up: "",
    notes: "",
    privacy: "Private",
    recurring: false,
  });

  useEffect(() => {
    saveAnchors(anchors);
  }, [anchors]);

  // Refresh tasks when the page mounts so the bridge picks up new captures.
  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  const onDayAnchors = useMemo(
    () =>
      [...anchors]
        .filter((a) => a.date === activeDate)
        .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)),
    [anchors, activeDate],
  );

  const available = useMemo(() => calculateAvailableTime(onDayAnchors), [onDayAnchors]);
  const plan = useMemo(() => buildDayPlan(tasks, currentEnergy), [tasks, currentEnergy]);
  const conflicts = useMemo(() => detectConflicts(onDayAnchors), [onDayAnchors]);
  const timeline = useMemo(() => buildTodayTimeline(onDayAnchors, available), [onDayAnchors, available]);
  const reality = useMemo(
    () =>
      calculateRealityScore({
        available,
        plan,
        currentEnergy,
        sleepReadiness: 7,
        academicPressure: 6,
        workoutReadiness: 6,
      }),
    [available, plan, currentEnergy],
  );

  const addAnchor = () => {
    if (!draft.title.trim()) return;
    const next = makeAnchor({ ...draft, title: draft.title.trim() });
    setAnchors((prev) => [next, ...prev]);
    setDraft((d) => ({ ...d, title: "", prep: "", follow_up: "", notes: "" }));
  };

  const removeAnchor = (id: string) =>
    setAnchors((prev) => prev.filter((a) => a.id !== id));

  const updateAnchor = (id: string, patch: Partial<CalendarAnchor>) =>
    setAnchors((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a,
      ),
    );

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyPlanningPrompt = () =>
    copy(
      "planning",
      buildCalendarPlanningPrompt({
        date: activeDate,
        anchors: onDayAnchors,
        available,
        plan,
        currentEnergy,
        sleepReadiness: 7,
        academicPressure: 6,
        workoutReadiness: 6,
        mcatNextMove: "(see MCAT page)",
      }),
    );

  const copyWeeklyReviewPrompt = () => {
    const weekStart = (() => {
      const d = new Date(activeDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return toDateKey(d);
    })();
    const weekEnd = (() => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 6);
      return toDateKey(d);
    })();
    const weekAnchors = anchors.filter((a) => a.date >= weekStart && a.date <= weekEnd);
    const meetings = weekAnchors.filter((a) =>
      ["Connex", "Work", "Career", "Academic"].includes(a.category),
    );
    copy(
      "weekly",
      buildWeeklyCalendarReviewPrompt({
        weekStart,
        anchors: weekAnchors,
        completedTasks: tasks.filter((t) => t.status === "completed"),
        missedTasks: tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "completed"),
        overloadedDays: [],
        bestWorkBlocks: [],
        worstWorkBlocks: [],
        sleepEnergyPattern: "Captured in Sleep + Daily Log pages.",
        meetings,
        prepFailures: weekAnchors.filter((a) => a.prep && a.date < today).map((a) => `${a.date} ${a.title}`),
        followUpFailures: weekAnchors.filter((a) => a.follow_up && a.date < today).map((a) => `${a.date} ${a.title}`),
        movedTasks: [],
      }),
    );
  };

  const loops = useMemo(() => listRecurringLoops(new Date(activeDate)), [activeDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="border-b border-border pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fixed anchors + flexible tasks + energy limits + reality check.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyPlanningPrompt}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
          >
            {copied === "planning" ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied === "planning" ? "Copied" : "Copy Calendar Planning Prompt"}
          </button>
          <button
            onClick={copyWeeklyReviewPrompt}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
          >
            {copied === "weekly" ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied === "weekly" ? "Copied" : "Copy Weekly Calendar Review Prompt"}
          </button>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/70"
          >
            <ListChecks size={14} />
            Open Task Command
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEW_TABS.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays size={12} />
          <input
            type="date"
            value={activeDate}
            onChange={(e) => setActiveDate(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
          />
        </div>
      </div>

      <RealitySummary reality={reality} available={available} />

      {view === "today" && (
        <TodayView
          anchors={onDayAnchors}
          timeline={timeline}
          conflicts={conflicts}
          onUpdate={updateAnchor}
          onRemove={removeAnchor}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          anchors={[...anchors].sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time),
          )}
          onRemove={removeAnchor}
        />
      )}
      {view === "week" && <WeekView anchors={anchors} activeDate={activeDate} />}
      {view === "month" && <MonthView anchors={anchors} activeDate={activeDate} />}

      <AddAnchorPanel draft={draft} setDraft={setDraft} onAdd={addAnchor} />

      <RecurringLoopsPanel loops={loops} />
    </div>
  );
}

function RealitySummary({
  reality,
  available,
}: {
  reality: ReturnType<typeof calculateRealityScore>;
  available: ReturnType<typeof calculateAvailableTime>;
}) {
  const tone =
    reality.score >= 7
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : reality.score >= 5
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <div className={`rounded-2xl border p-4 ${tone}`}>
        <div className="text-[10px] uppercase tracking-wider font-semibold">Plan reality</div>
        <div className="font-mono-data mt-2 text-3xl font-semibold">{reality.score.toFixed(1)}</div>
        <div className="mt-1 text-xs">
          time {reality.available_time_fit.toFixed(1)} · energy {reality.energy_fit.toFixed(1)} ·
          focus {reality.priority_focus.toFixed(1)} · recovery {reality.recovery_protection.toFixed(1)}
        </div>
      </div>
      <SmallStat label="Open time" value={`${available.totalOpenMinutes} min`} hint="After anchors + maintenance + recovery" />
      <SmallStat
        label="Largest block"
        value={
          available.largestOpenBlock
            ? `${available.largestOpenBlock.start}–${available.largestOpenBlock.end}`
            : "—"
        }
        hint={
          available.largestOpenBlock
            ? `${available.largestOpenBlock.durationMinutes} min`
            : "Calendar full or unset"
        }
      />
      <SmallStat
        label="Best deep work"
        value={
          available.bestDeepWork
            ? `${available.bestDeepWork.start}–${available.bestDeepWork.end}`
            : "—"
        }
        hint={available.bestDeepWork ? `${available.bestDeepWork.durationMinutes} min` : "No clean morning block"}
      />
      <SmallStat
        label="Shutdown target"
        value={available.bestShutdownTarget}
        hint="Pulled earlier when sleep debt is high"
      />
      <div className="md:col-span-3 xl:col-span-5 card-surface p-4">
        <div className="text-xs font-semibold text-foreground mb-2">Recommendations</div>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {reality.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SmallStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="font-mono-data mt-2 text-xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function TodayView({
  anchors,
  timeline,
  conflicts,
  onUpdate,
  onRemove,
}: {
  anchors: CalendarAnchor[];
  timeline: ReturnType<typeof buildTodayTimeline>;
  conflicts: ReturnType<typeof detectConflicts>;
  onUpdate: (id: string, patch: Partial<CalendarAnchor>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-foreground">Today timeline</div>
          <div className="text-xs text-muted-foreground">
            {timeline.length} blocks
          </div>
        </div>
        {conflicts.length > 0 && (
          <div className="notice-warning mb-3 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">{conflicts.length} overlap{conflicts.length === 1 ? "" : "s"} detected</div>
              <ul className="mt-1 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.a.title} ({c.a.start_time}) ↔ {c.b.title} ({c.b.start_time})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Timeline timeline={timeline} />
      </div>
      <div className="card-surface p-4">
        <div className="text-sm font-semibold text-foreground mb-3">Today anchors</div>
        {anchors.length === 0 ? (
          <div className="empty-state">
            No anchors yet for this day. Add a class, Connex Zoom, work shift, or appointment below.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {anchors.map((a) => (
              <AnchorRow key={a.id} anchor={a} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Timeline({ timeline }: { timeline: ReturnType<typeof buildTodayTimeline> }) {
  if (timeline.length === 0) {
    return <div className="empty-state">Add an anchor or set wake/sleep to see your timeline.</div>;
  }
  return (
    <ol className="relative ml-3 border-l border-border space-y-3">
      {timeline.map((slot, i) => {
        const palette = slot.kind === "anchor" && slot.category
          ? CATEGORY_COLORS[slot.category]
          : null;
        const dot =
          slot.kind === "deep-work"
            ? "bg-sky-500"
            : slot.kind === "workout"
              ? "bg-emerald-500"
              : slot.kind === "maintenance"
                ? "bg-amber-500"
                : slot.kind === "shutdown"
                  ? "bg-violet-500"
                  : "bg-primary";
        return (
          <li key={`${slot.start}-${i}`} className="ml-4 relative">
            <span
              className={`absolute -left-[22px] top-1.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${dot}`}
            />
            <div className="flex items-baseline gap-3">
              <span className="font-mono-data text-xs text-muted-foreground tabular-nums">
                {slot.start}–{slot.end}
              </span>
              <span className="text-sm text-foreground">{slot.label}</span>
              {palette && slot.category ? (
                <span
                  className={`ml-1 text-[10px] font-medium uppercase tracking-wider ${palette.bg} ${palette.text} rounded-full px-2 py-0.5`}
                >
                  {slot.category}
                </span>
              ) : null}
            </div>
            {slot.detail ? (
              <div className="text-xs text-muted-foreground mt-0.5">{slot.detail}</div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function AnchorRow({
  anchor,
  onUpdate,
  onRemove,
}: {
  anchor: CalendarAnchor;
  onUpdate: (id: string, patch: Partial<CalendarAnchor>) => void;
  onRemove: (id: string) => void;
}) {
  const palette = CATEGORY_COLORS[anchor.category];
  return (
    <li className="py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${palette.bg} ${palette.text}`}
            >
              {anchor.category}
            </span>
            <span className="text-sm font-medium text-foreground">{anchor.title}</span>
            <span className="font-mono-data text-xs text-muted-foreground">
              {anchor.start_time}–{anchor.end_time} · {anchorDuration(anchor)}m
            </span>
            <span className="text-[10px] text-muted-foreground">{anchor.privacy}</span>
          </div>
          {(anchor.location || anchor.link || anchor.people) && (
            <div className="text-xs text-muted-foreground mt-1">
              {[anchor.location, anchor.people].filter(Boolean).join(" · ")}
              {anchor.link ? (
                <>
                  {" · "}
                  <a className="underline" href={anchor.link} target="_blank" rel="noreferrer">
                    link
                  </a>
                </>
              ) : null}
            </div>
          )}
        </div>
        <button
          onClick={() => onRemove(anchor.id)}
          className="text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {(anchor.prep || anchor.follow_up || anchor.notes) && (
        <div className="grid gap-2 md:grid-cols-3 text-xs">
          {anchor.prep ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prep</div>
              <div className="text-foreground">{anchor.prep}</div>
            </div>
          ) : null}
          {anchor.follow_up ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow up</div>
              <div className="text-foreground">{anchor.follow_up}</div>
            </div>
          ) : null}
          {anchor.notes ? (
            <div className="rounded-lg bg-muted/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
              <div className="text-foreground">{anchor.notes}</div>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <select
          value={anchor.privacy}
          onChange={(e) => onUpdate(anchor.id, { privacy: e.target.value as PrivacyLevel })}
          className="rounded-md border border-border bg-card px-2 py-1"
        >
          {PRIVACY_LEVELS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={anchor.category}
          onChange={(e) => onUpdate(anchor.id, { category: e.target.value as AnchorCategory })}
          className="rounded-md border border-border bg-card px-2 py-1"
        >
          {ANCHOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function AgendaView({
  anchors,
  onRemove,
}: {
  anchors: CalendarAnchor[];
  onRemove: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarAnchor[]>();
    for (const a of anchors) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [anchors]);

  if (grouped.length === 0) {
    return <div className="empty-state">No anchors on the agenda yet. Add one below.</div>;
  }

  return (
    <div className="space-y-3">
      {grouped.map(([date, list]) => (
        <div key={date} className="card-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-foreground">
              {new Date(date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
            <span className="text-xs text-muted-foreground">{list.length} anchors</span>
          </div>
          <ul className="space-y-2">
            {list.map((a) => {
              const palette = CATEGORY_COLORS[a.category];
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${palette.bg} ${palette.text}`}
                    >
                      {a.category}
                    </span>
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {a.start_time}–{a.end_time}
                    </span>
                    <span className="text-sm text-foreground truncate">{a.title}</span>
                  </div>
                  <button
                    onClick={() => onRemove(a.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WeekView({ anchors, activeDate }: { anchors: CalendarAnchor[]; activeDate: string }) {
  const weekStart = useMemo(() => {
    const d = new Date(activeDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  }, [activeDate]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = toDateKey(d);
      return {
        key,
        label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        anchors: anchors.filter((a) => a.date === key),
      };
    });
  }, [weekStart, anchors]);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground">Week view</div>
        <div className="text-xs text-muted-foreground">
          Lightweight grid · drag-to-schedule arrives in roadmap
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.key} className="rounded-xl border border-border bg-card/60 p-2 min-h-[140px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              {d.label}
            </div>
            <ul className="space-y-1">
              {d.anchors
                .sort((x, y) => parseTimeToMinutes(x.start_time) - parseTimeToMinutes(y.start_time))
                .slice(0, 6)
                .map((a) => {
                  const palette = CATEGORY_COLORS[a.category];
                  return (
                    <li
                      key={a.id}
                      className={`text-[11px] rounded-md px-1.5 py-1 ${palette.bg} ${palette.text}`}
                    >
                      <div className="font-mono-data text-[10px] opacity-80">{a.start_time}</div>
                      <div className="truncate">{a.title}</div>
                    </li>
                  );
                })}
              {d.anchors.length === 0 && (
                <li className="text-[11px] text-muted-foreground">—</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({ anchors, activeDate }: { anchors: CalendarAnchor[]; activeDate: string }) {
  const cells = useMemo(() => {
    const d = new Date(activeDate);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = new Date(first);
    const startDay = first.getDay();
    start.setDate(first.getDate() - ((startDay + 6) % 7));
    return Array.from({ length: 42 }).map((_, i) => {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const key = toDateKey(cur);
      return {
        key,
        day: cur.getDate(),
        inMonth: cur.getMonth() === d.getMonth(),
        anchors: anchors.filter((a) => a.date === key),
      };
    });
  }, [activeDate, anchors]);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground">
          {new Date(activeDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="text-xs text-muted-foreground">
          Placeholder grid · click a day in the picker above to focus.
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`min-h-[78px] rounded-md border border-border p-1 ${c.inMonth ? "bg-card/60" : "bg-muted/30 opacity-60"}`}
          >
            <div className="text-[10px] text-muted-foreground">{c.day}</div>
            <div className="mt-1 space-y-0.5">
              {c.anchors.slice(0, 2).map((a) => {
                const palette = CATEGORY_COLORS[a.category];
                return (
                  <div
                    key={a.id}
                    className={`truncate text-[10px] rounded px-1 ${palette.bg} ${palette.text}`}
                  >
                    {a.start_time} {a.title}
                  </div>
                );
              })}
              {c.anchors.length > 2 && (
                <div className="text-[10px] text-muted-foreground">+{c.anchors.length - 2}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddAnchorPanel({
  draft,
  setDraft,
  onAdd,
}: {
  draft: Omit<CalendarAnchor, "id" | "created_at" | "updated_at">;
  setDraft: React.Dispatch<
    React.SetStateAction<Omit<CalendarAnchor, "id" | "created_at" | "updated_at">>
  >;
  onAdd: () => void;
}) {
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Auto-bump end time when start changes if the user has not customized it.
  const onStartChange = (v: string) => {
    setDraft((d) => {
      const startNew = parseTimeToMinutes(v);
      const startOld = parseTimeToMinutes(d.start_time);
      const endOld = parseTimeToMinutes(d.end_time);
      const duration = Math.max(15, endOld - startOld);
      return { ...d, start_time: v, end_time: minutesToTime(startNew + duration) };
    });
  };

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Add an anchor</div>
        <div className="text-xs text-muted-foreground">
          Anchors are fixed events. Flexible work goes in Task Command.
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          placeholder="Title (e.g. Connex Zoom, Class, Work shift)"
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={draft.category}
          onChange={(e) => update("category", e.target.value as AnchorCategory)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          {ANCHOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 md:grid-cols-5 text-xs">
        <Field label="Date" type="date" value={draft.date} onChange={(v) => update("date", v)} />
        <Field label="Start" type="time" value={draft.start_time} onChange={onStartChange} />
        <Field label="End" type="time" value={draft.end_time} onChange={(v) => update("end_time", v)} />
        <Field label="Location" value={draft.location} onChange={(v) => update("location", v)} placeholder="Room, building, address" />
        <Field label="Link" value={draft.link} onChange={(v) => update("link", v)} placeholder="Zoom or meeting URL" />
      </div>
      <div className="grid gap-2 md:grid-cols-3 text-xs">
        <Field label="People" value={draft.people} onChange={(v) => update("people", v)} placeholder="Who is involved" />
        <Field label="Prep" value={draft.prep} onChange={(v) => update("prep", v)} placeholder="What to do before" />
        <Field label="Follow up" value={draft.follow_up} onChange={(v) => update("follow_up", v)} placeholder="What to do after" />
      </div>
      <div className="grid gap-2 md:grid-cols-3 text-xs">
        <Field
          label="Notes"
          value={draft.notes}
          onChange={(v) => update("notes", v)}
          placeholder="Anything to remember"
          className="md:col-span-2"
        />
        <div className="flex items-end gap-3">
          <label className="flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground">
            Privacy
            <select
              value={draft.privacy}
              onChange={(e) => update("privacy", e.target.value as PrivacyLevel)}
              className="mt-1 rounded-md border border-border bg-card px-2 py-1 text-sm normal-case tracking-normal"
            >
              {PRIVACY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.recurring}
              onChange={(e) => update("recurring", e.target.checked)}
            />
            Recurring
          </label>
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={!draft.title.trim()}
        className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} /> Add anchor
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col text-[10px] uppercase tracking-wider text-muted-foreground ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 rounded-md border border-border bg-card px-2 py-1 text-sm normal-case tracking-normal text-foreground"
      />
    </label>
  );
}

function RecurringLoopsPanel({ loops }: { loops: ReturnType<typeof listRecurringLoops> }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat size={14} className="text-primary" />
          <div className="text-sm font-semibold text-foreground">Recurring life loops</div>
        </div>
        <span className="text-xs text-muted-foreground">
          Triggers, cadence, and next firing
        </span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {loops.map((loop) => (
          <li key={loop.id} className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">{loop.title}</div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {loop.cadence}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={11} /> {loop.trigger} · next: {loop.next_occurrence}
            </div>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              {loop.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="text-[11px] text-foreground">→ {loop.expected_output}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
