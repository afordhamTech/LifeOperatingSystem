import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { SyncBadge } from "@/components/SyncBadge";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { calcFaithScore } from "@/lib/calculations";
import {
  fetchFaithEntry,
  fetchFaithWeek,
  type FaithEntry,
  type LifeeeSyncStatus,
  upsertFaithEntry,
} from "@/lib/lifeee-persistence";
import { Flame } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PageDecisionHeader } from "@/components/ui-kit";

const STORAGE_KEY = "lifeee.faith_logs.v1";

function defaultFaithEntry(date: string): FaithEntry {
  return {
    date,
    prayerDone: false,
    bibleReading: "",
    chapterStudied: "",
    mainLesson: "",
    question: "",
    actionStep: "",
    temptation: "",
    gratitude: "",
    churchInvolvement: false,
  };
}

function readLocalFaithEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FaithEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFaithEntry(entry: FaithEntry) {
  if (typeof window === "undefined") return;
  const entries = readLocalFaithEntries().filter((item) => item.date !== entry.date);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...entries]));
}

function serializeFaithEntry(entry: FaithEntry) {
  return JSON.stringify({
    prayerDone: entry.prayerDone,
    bibleReading: entry.bibleReading,
    chapterStudied: entry.chapterStudied,
    mainLesson: entry.mainLesson,
    question: entry.question,
    actionStep: entry.actionStep,
    temptation: entry.temptation,
    gratitude: entry.gratitude,
    churchInvolvement: entry.churchInvolvement,
  });
}

function hasMeaningfulFaithDraft(entry: FaithEntry) {
  return (
    entry.prayerDone ||
    entry.churchInvolvement ||
    Boolean(entry.bibleReading.trim()) ||
    Boolean(entry.chapterStudied.trim()) ||
    Boolean(entry.mainLesson.trim()) ||
    Boolean(entry.question.trim()) ||
    Boolean(entry.actionStep.trim()) ||
    Boolean(entry.temptation.trim()) ||
    Boolean(entry.gratitude.trim())
  );
}

export default function FaithPage() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartKey = weekStart.toISOString().split("T")[0];
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<FaithEntry>(() => {
    return readLocalFaithEntries().find((entry) => entry.date === today) ?? defaultFaithEntry(today);
  });
  const [dailyScores, setDailyScores] = useState<{ date: string; score: number }[]>([]);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ local: FaithEntry; cloud: FaithEntry } | null>(null);
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalFaithEntries();
      const localDraft = localEntries.find((entry) => entry.date === today) ?? null;
      const localEntry = localDraft && hasMeaningfulFaithDraft(localDraft) ? localDraft : null;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setForm(localEntry ?? defaultFaithEntry(today));
        setDailyScores(
          localEntries
            .filter((entry) => entry.date >= weekStartKey)
            .map((entry) => ({
              date: entry.date,
              score: calcFaithScore(entry.prayerDone, entry.bibleReading, entry.mainLesson, entry.actionStep),
            })),
        );
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const [remoteEntry, remoteWeek] = await Promise.all([
          fetchFaithEntry(userId, today),
          fetchFaithWeek(userId, weekStartKey),
        ]);
        if (!active) return;

        let nextSyncStatus: LifeeeSyncStatus = "saved";

        if (remoteEntry && localEntry && serializeFaithEntry(remoteEntry) !== serializeFaithEntry(localEntry)) {
          setForm(remoteEntry);
          setConflict({ local: localEntry, cloud: remoteEntry });
          nextSyncStatus = "local";
        } else if (!remoteEntry && localEntry) {
          const uploaded = await upsertFaithEntry(userId, localEntry);
          if (!active) return;
          setForm(uploaded);
          writeLocalFaithEntry(uploaded);
          setConflict(null);
        } else if (remoteEntry) {
          setForm(remoteEntry);
          writeLocalFaithEntry(remoteEntry);
          setConflict(null);
        } else {
          setForm(defaultFaithEntry(today));
          setConflict(null);
          nextSyncStatus = "local";
        }

        setDailyScores(remoteWeek);
        remoteLoadedRef.current = true;
        setSyncStatus(nextSyncStatus);
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load faith log.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, today, userId, weekStartKey]);

  const score = calcFaithScore(form.prayerDone, form.bibleReading, form.mainLesson, form.actionStep);

  const handleSave = async () => {
    if (conflict) {
      setSyncError("Choose Use local, Use cloud, or Cancel before saving.");
      return;
    }

    const entry = { ...form, date: today, faithScore: score };
    writeLocalFaithEntry(entry);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = await upsertFaithEntry(userId, entry);
        setForm(saved);
        writeLocalFaithEntry(saved);
        setDailyScores(await fetchFaithWeek(userId, weekStartKey));
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save faith log.");
        setSyncStatus("error");
      }
    } else {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
    }
  };

  const handleUseLocalConflict = async () => {
    if (!conflict || !userId) return;
    try {
      setSyncStatus("saving");
      setSyncError(null);
      const saved = await upsertFaithEntry(userId, {
        ...conflict.local,
        date: today,
        faithScore: calcFaithScore(
          conflict.local.prayerDone,
          conflict.local.bibleReading,
          conflict.local.mainLesson,
          conflict.local.actionStep,
        ),
      });
      setForm(saved);
      writeLocalFaithEntry(saved);
      setDailyScores(await fetchFaithWeek(userId, weekStartKey));
      setConflict(null);
      setSyncStatus("saved");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save local faith draft.");
      setSyncStatus("error");
    }
  };

  const handleUseCloudConflict = () => {
    if (!conflict) return;
    setForm(conflict.cloud);
    writeLocalFaithEntry(conflict.cloud);
    setConflict(null);
    setSyncError(null);
    setSyncStatus("saved");
  };

  const streak = [...dailyScores]
    .sort((a, b) => b.date.localeCompare(a.date))
    .reduce((count, day) => (count === -1 ? -1 : day.score >= 50 ? count + 1 : -1), 0);

  const promptText = `Here is my faith data:

Bible passage: ${form.bibleReading || "—"}
Chapter studied: ${form.chapterStudied || "—"}
What I noticed: ${form.mainLesson || "—"}
Question I have: ${form.question || "—"}
Current struggle: ${form.temptation || "—"}
Prayer focus: ${form.prayerDone ? "Completed" : "Not yet"}
Action step: ${form.actionStep || "—"}
Gratitude: ${form.gratitude || "—"}
Faith practice: ${score}%

Help me turn this into a short Bible study, reflection, prayer, and one action step for today.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <PageDecisionHeader
          title="Faith"
          question="Read, reflect, pray, and obey one concrete step today."
        >
          <SyncBadge status={syncStatus} />
        </PageDecisionHeader>
        {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
        {conflict ? (
          <div className="mt-3 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 p-3 text-xs text-[#6f685f]">
            <div className="font-semibold text-[#25313c]">Local draft and cloud faith log both exist.</div>
            <div className="mt-1">Choose one before saving so cloud data is not overwritten silently.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleUseLocalConflict} className="btn-primary px-3 py-1 text-xs">
                Use local
              </button>
              <button type="button" onClick={handleUseCloudConflict} className="btn-primary px-3 py-1 text-xs">
                Use cloud
              </button>
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="rounded border border-[#ddd4c6] px-3 py-1 text-xs text-[#6f685f]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-2">TODAY'S FAITH FOCUS</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase text-[#6f685f]">Passage</div>
            <div className="text-[#25313c]">{form.bibleReading || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[#6f685f]">Prayer focus</div>
            <div className="text-[#25313c]">{form.prayerDone ? "Completed" : "Not yet"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[#6f685f]">Action step</div>
            <div className="text-[#25313c]">{form.actionStep || "—"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#25313c]">DAILY CHECK-IN</h3>
            <span className="text-[10px] text-[#6a9a74]">
              Church involvement and temptation save to Supabase.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-[#6f685f] cursor-pointer">
              <input
                type="checkbox"
                checked={form.prayerDone}
                onChange={(e) => setForm((p) => ({ ...p, prayerDone: e.target.checked }))}
                className="rounded"
              />
              Prayer completed
            </label>
            <label className="flex items-center gap-2 text-sm text-[#6f685f] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.bibleReading.trim())}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    bibleReading: e.target.checked ? p.bibleReading || "Completed" : "",
                  }))
                }
                className="rounded"
              />
              Bible reading completed
            </label>
            <label className="flex items-center gap-2 text-sm text-[#6f685f] cursor-pointer">
              <input
                type="checkbox"
                checked={form.churchInvolvement}
                onChange={(e) => setForm((p) => ({ ...p, churchInvolvement: e.target.checked }))}
                className="rounded"
              />
              Church/group involvement
            </label>
            <div>
              <Label htmlFor="faith-bible-passage" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Bible passage
              </Label>
              <input
                id="faith-bible-passage"
                type="text"
                placeholder="Bible passage / reading"
                value={form.bibleReading}
                onChange={(e) => setForm((p) => ({ ...p, bibleReading: e.target.value }))}
                className="input-dark w-full"
              />
            </div>
            <div>
              <Label htmlFor="faith-chapter-studied" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Chapter studied
              </Label>
              <input
                id="faith-chapter-studied"
                type="text"
                placeholder="Chapter studied"
                value={form.chapterStudied}
                onChange={(e) => setForm((p) => ({ ...p, chapterStudied: e.target.value }))}
                className="input-dark w-full"
              />
            </div>
            <div>
              <Label htmlFor="faith-main-lesson" className="text-[10px] uppercase text-[#6f685f] mb-1">
                What stood out?
              </Label>
              <textarea
                id="faith-main-lesson"
                placeholder="Main lesson"
                value={form.mainLesson}
                onChange={(e) => setForm((p) => ({ ...p, mainLesson: e.target.value }))}
                className="input-dark h-16 resize-none w-full"
              />
            </div>
            <div>
              <Label htmlFor="faith-question" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Question I have
              </Label>
              <textarea
                id="faith-question"
                placeholder="Question I had"
                value={form.question}
                onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                className="input-dark h-16 resize-none w-full"
              />
            </div>
            <div>
              <Label htmlFor="faith-temptation" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Current struggle or temptation
              </Label>
              <textarea
                id="faith-temptation"
                placeholder="Temptation or struggle"
                value={form.temptation}
                onChange={(e) => setForm((p) => ({ ...p, temptation: e.target.value }))}
                className="input-dark h-16 resize-none w-full"
              />
            </div>
            <div>
              <Label htmlFor="faith-gratitude" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Gratitude
              </Label>
              <textarea
                id="faith-gratitude"
                placeholder="Gratitude"
                value={form.gratitude}
                onChange={(e) => setForm((p) => ({ ...p, gratitude: e.target.value }))}
                className="input-dark h-16 resize-none w-full"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="faith-action-step" className="text-[10px] uppercase text-[#6f685f] mb-1">
                Action step
              </Label>
              <input
                id="faith-action-step"
                type="text"
                placeholder="Action step"
                value={form.actionStep}
                onChange={(e) => setForm((p) => ({ ...p, actionStep: e.target.value }))}
                className="input-dark w-full"
              />
            </div>
          </div>
          <button onClick={handleSave} className="btn-primary w-full mt-3">
            {syncStatus === "saving" ? "Saving..." : "Save Faith Practice"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4 text-center">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">FAITH PRACTICE</h3>
            <div className="text-sm text-[#6f685f]">
              {score >= 80 ? "Strong" : score >= 50 ? "Growing" : "Needs attention"}
            </div>
            <div className="text-xs text-[#8c8478] mt-2">
              Practice score: <span className="font-mono-data text-[#9a7bbd]">{score}%</span>
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">THIS WEEK</h3>
            <div className="flex gap-1 justify-center">
              {dailyScores.map((day, i) => (
                <div
                  key={`${day.date}-${i}`}
                  className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono-data ${
                    day.score >= 75
                      ? "bg-[#6a9a74]/20 text-[#6a9a74]"
                      : day.score >= 50
                        ? "bg-[#c39a4e]/20 text-[#c39a4e]"
                        : "bg-[#f2ece3] text-[#8c8478]"
                  }`}
                  title={`${day.date}: ${day.score}%`}
                >
                  {new Date(day.date).toLocaleDateString("en-US", { weekday: "narrow" })}
                </div>
              ))}
              {dailyScores.length === 0 && Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-8 h-8 rounded bg-[#f2ece3]" />
              ))}
            </div>
            <div className="mt-3 text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-[#6f685f]">
                <Flame size={14} className="text-[#c39a4e]" />
                <span>{Math.max(0, streak)} day streak</span>
              </div>
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-2">BREAKDOWN</h3>
            <div className="space-y-2 text-xs">
              <ScoreItem label="Prayer" value={form.prayerDone ? 30 : 0} max={30} />
              <ScoreItem label="Bible Study" value={form.bibleReading ? 30 : 0} max={30} />
              <ScoreItem label="Reflection" value={form.mainLesson ? 20 : 0} max={20} />
              <ScoreItem label="Action Step" value={form.actionStep ? 20 : 0} max={20} />
            </div>
          </div>
        </div>
      </div>

      <ChatGPTPrompt title="Faith Reflection" promptText={promptText} />
    </div>
  );
}

function ScoreItem({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#6f685f] w-20">{label}</span>
      <div className="flex-1 h-1 bg-[#ece5da] rounded-full overflow-hidden">
        <div className="h-full bg-[#9a7bbd] rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="font-mono-data text-[#6f685f] w-8">{value}%</span>
    </div>
  );
}
