import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { calcFaithScore } from "@/lib/calculations";
import {
  fetchFaithEntry,
  fetchFaithWeek,
  getSyncLabel,
  getSyncTone,
  type FaithEntry,
  type LifeeeSyncStatus,
  upsertFaithEntry,
} from "@/lib/lifeee-persistence";
import { Flame } from "lucide-react";

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
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalFaithEntries();
      const localEntry = localEntries.find((entry) => entry.date === today) ?? null;

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

        if (!remoteEntry && localEntry) {
          const uploaded = await upsertFaithEntry(userId, localEntry);
          if (!active) return;
          setForm(uploaded);
          writeLocalFaithEntry(uploaded);
        } else {
          const next = remoteEntry ?? defaultFaithEntry(today);
          setForm(next);
          writeLocalFaithEntry(next);
        }

        setDailyScores(remoteWeek);
        remoteLoadedRef.current = true;
        setSyncStatus("saved");
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
Faith score: ${score}%

Help me turn this into a short Bible study, reflection, prayer, and one action step for today.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Faith</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Track spiritual discipline, Bible study, prayer, and alignment with your values.
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
            {getSyncLabel(syncStatus)}
          </span>
        </div>
        {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">DAILY CHECK-IN</h3>
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
                checked={form.churchInvolvement}
                onChange={(e) => setForm((p) => ({ ...p, churchInvolvement: e.target.checked }))}
                className="rounded"
              />
              Church/group involvement
            </label>
            <input
              type="text"
              placeholder="Bible passage / reading"
              value={form.bibleReading}
              onChange={(e) => setForm((p) => ({ ...p, bibleReading: e.target.value }))}
              className="input-dark"
            />
            <input
              type="text"
              placeholder="Chapter studied"
              value={form.chapterStudied}
              onChange={(e) => setForm((p) => ({ ...p, chapterStudied: e.target.value }))}
              className="input-dark"
            />
            <textarea
              placeholder="Main lesson"
              value={form.mainLesson}
              onChange={(e) => setForm((p) => ({ ...p, mainLesson: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <textarea
              placeholder="Question I had"
              value={form.question}
              onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <textarea
              placeholder="Temptation or struggle"
              value={form.temptation}
              onChange={(e) => setForm((p) => ({ ...p, temptation: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <textarea
              placeholder="Gratitude"
              value={form.gratitude}
              onChange={(e) => setForm((p) => ({ ...p, gratitude: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <input
              type="text"
              placeholder="Action step"
              value={form.actionStep}
              onChange={(e) => setForm((p) => ({ ...p, actionStep: e.target.value }))}
              className="input-dark md:col-span-2"
            />
          </div>
          <button onClick={handleSave} className="btn-primary w-full mt-3">
            {syncStatus === "saving" ? "Saving..." : "Save & Score"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4 text-center">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">FAITH SCORE</h3>
            <div className="text-4xl font-bold text-[#9a7bbd]">{score}%</div>
            <div className="text-xs text-[#6f685f] mt-1">
              {score >= 80 ? "Strong" : score >= 50 ? "Growing" : "Needs attention"}
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
