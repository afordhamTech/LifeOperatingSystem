import { useEffect, useRef, useState, type ReactNode } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { SyncBadge } from "@/components/SyncBadge";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { calcSubstanceScore } from "@/lib/calculations";
import {
  fetchSubstanceEntry,
  fetchSubstanceWeek,
  type LifeeeSyncStatus,
  type SubstanceEntry,
  upsertSubstanceEntry,
} from "@/lib/lifeee-persistence";
import { BookOpen, PenLine, MessageSquare, Lightbulb } from "lucide-react";

const STORAGE_KEY = "lifeee.substance_logs.v1";

function defaultSubstanceEntry(date: string): SubstanceEntry {
  return {
    date,
    readingDone: "",
    topicStudied: "",
    notesTaken: "",
    flashcardsMade: 0,
    conversationPractice: false,
    newConcept: "",
    questionOfDay: "",
    writingPractice: false,
    speakingPractice: false,
  };
}

function readLocalSubstanceEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SubstanceEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSubstanceEntry(entry: SubstanceEntry) {
  if (typeof window === "undefined") return;
  const entries = readLocalSubstanceEntries().filter((item) => item.date !== entry.date);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...entries]));
}

function serializeSubstanceEntry(entry: SubstanceEntry) {
  return JSON.stringify({
    readingDone: entry.readingDone,
    topicStudied: entry.topicStudied,
    notesTaken: entry.notesTaken,
    flashcardsMade: entry.flashcardsMade,
    conversationPractice: entry.conversationPractice,
    newConcept: entry.newConcept,
    questionOfDay: entry.questionOfDay,
    writingPractice: entry.writingPractice,
    speakingPractice: entry.speakingPractice,
  });
}

export default function SubstancePage() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartKey = weekStart.toISOString().split("T")[0];
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<SubstanceEntry>(() => {
    return readLocalSubstanceEntries().find((entry) => entry.date === today) ?? defaultSubstanceEntry(today);
  });
  const [trend, setTrend] = useState<{ date: string; score: number }[]>([]);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ local: SubstanceEntry; cloud: SubstanceEntry } | null>(null);
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalSubstanceEntries();
      const localEntry = localEntries.find((entry) => entry.date === today) ?? null;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setForm(localEntry ?? defaultSubstanceEntry(today));
        setTrend(
          localEntries
            .filter((entry) => entry.date >= weekStartKey)
            .map((entry) => ({
              date: entry.date,
              score: calcSubstanceScore(
                entry.readingDone,
                entry.notesTaken,
                entry.writingPractice,
                entry.speakingPractice,
                entry.newConcept,
              ),
            })),
        );
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const [remoteEntry, remoteTrend] = await Promise.all([
          fetchSubstanceEntry(userId, today),
          fetchSubstanceWeek(userId, weekStartKey),
        ]);
        if (!active) return;

        if (
          remoteEntry &&
          localEntry &&
          serializeSubstanceEntry(remoteEntry) !== serializeSubstanceEntry(localEntry)
        ) {
          setForm(remoteEntry);
          setConflict({ local: localEntry, cloud: remoteEntry });
        } else if (!remoteEntry && localEntry) {
          const uploaded = await upsertSubstanceEntry(userId, localEntry);
          if (!active) return;
          setForm(uploaded);
          writeLocalSubstanceEntry(uploaded);
          setConflict(null);
        } else {
          const next = remoteEntry ?? defaultSubstanceEntry(today);
          setForm(next);
          writeLocalSubstanceEntry(next);
          setConflict(null);
        }

        setTrend(remoteTrend);
        remoteLoadedRef.current = true;
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load substance log.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, today, userId, weekStartKey]);

  const score = calcSubstanceScore(
    form.readingDone,
    form.notesTaken,
    form.writingPractice,
    form.speakingPractice,
    form.newConcept,
  );

  const handleSave = async () => {
    if (conflict) {
      setSyncError("Choose Use local, Use cloud, or Cancel before saving.");
      return;
    }

    const entry = { ...form, date: today, substanceScore: score };
    writeLocalSubstanceEntry(entry);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = await upsertSubstanceEntry(userId, entry);
        setForm(saved);
        writeLocalSubstanceEntry(saved);
        setTrend(await fetchSubstanceWeek(userId, weekStartKey));
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save substance log.");
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
      const localScore = calcSubstanceScore(
        conflict.local.readingDone,
        conflict.local.notesTaken,
        conflict.local.writingPractice,
        conflict.local.speakingPractice,
        conflict.local.newConcept,
      );
      const saved = await upsertSubstanceEntry(userId, {
        ...conflict.local,
        date: today,
        substanceScore: localScore,
      });
      setForm(saved);
      writeLocalSubstanceEntry(saved);
      setTrend(await fetchSubstanceWeek(userId, weekStartKey));
      setConflict(null);
      setSyncStatus("saved");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save local substance draft.");
      setSyncStatus("error");
    }
  };

  const handleUseCloudConflict = () => {
    if (!conflict) return;
    setForm(conflict.cloud);
    writeLocalSubstanceEntry(conflict.cloud);
    setConflict(null);
    setSyncError(null);
    setSyncStatus("saved");
  };

  const promptText = `Here is what I learned or thought about today:

Topic: ${form.topicStudied || "—"}
Reading: ${form.readingDone || "—"}
Notes: ${form.notesTaken || "—"}
New concept: ${form.newConcept || "—"}
Question of the day: ${form.questionOfDay || "—"}
Writing practice: ${form.writingPractice ? "Yes" : "No"}
Speaking practice: ${form.speakingPractice ? "Yes" : "No"}
Substance score: ${(score * 100).toFixed(0)}%

Turn this into a deeper explanation, 5 talking points, and 3 questions I could use in a real conversation.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Substance & Learning</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Build depth, better thinking, better speech, and stronger conversation ability.
            </p>
          </div>
          <SyncBadge status={syncStatus} />
        </div>
        {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
        {conflict ? (
          <div className="mt-3 rounded border border-[#c39a4e]/30 bg-[#c39a4e]/10 p-3 text-xs text-[#6f685f]">
            <div className="font-semibold text-[#25313c]">Local draft and cloud learning log both exist.</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#25313c]">LEARNING LOG</h3>
            <span className="text-[10px] text-[#6a9a74]">
              Topic studied and notes taken save to Supabase.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Reading done (book/article)"
              value={form.readingDone}
              onChange={(e) => setForm((p) => ({ ...p, readingDone: e.target.value }))}
              className="input-dark"
            />
            <input
              type="text"
              placeholder="Topic studied"
              value={form.topicStudied}
              onChange={(e) => setForm((p) => ({ ...p, topicStudied: e.target.value }))}
              className="input-dark"
            />
            <textarea
              placeholder="Notes taken"
              value={form.notesTaken}
              onChange={(e) => setForm((p) => ({ ...p, notesTaken: e.target.value }))}
              className="input-dark h-16 resize-none md:col-span-2"
            />
            <textarea
              placeholder="New concept learned"
              value={form.newConcept}
              onChange={(e) => setForm((p) => ({ ...p, newConcept: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <textarea
              placeholder="Question of the day"
              value={form.questionOfDay}
              onChange={(e) => setForm((p) => ({ ...p, questionOfDay: e.target.value }))}
              className="input-dark h-16 resize-none"
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-[#6f685f] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.writingPractice}
                  onChange={(e) => setForm((p) => ({ ...p, writingPractice: e.target.checked }))}
                  className="rounded"
                />
                Writing
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6f685f] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.speakingPractice}
                  onChange={(e) => setForm((p) => ({ ...p, speakingPractice: e.target.checked }))}
                  className="rounded"
                />
                Speaking
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6f685f] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.conversationPractice}
                  onChange={(e) => setForm((p) => ({ ...p, conversationPractice: e.target.checked }))}
                  className="rounded"
                />
                Conversation
              </label>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Flashcards made</label>
              <input
                type="number"
                value={form.flashcardsMade}
                onChange={(e) => setForm((p) => ({ ...p, flashcardsMade: Number(e.target.value) }))}
                className="input-dark w-24"
              />
            </div>
          </div>
          <button onClick={handleSave} className="btn-primary w-full mt-3">
            {syncStatus === "saving" ? "Saving..." : "Save & Score"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4 text-center">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">SUBSTANCE SCORE</h3>
            <div className="text-4xl font-bold text-[#c39a4e]">{(score * 100).toFixed(0)}%</div>
            <div className="text-xs text-[#6f685f] mt-1">
              {score >= 0.8 ? "Deep thinker" : score >= 0.5 ? "Building" : "Start reading"}
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-2">FACTORS</h3>
            <div className="space-y-2">
              <FactorBar label="Reading" value={form.readingDone ? 25 : 0} max={25} icon={<BookOpen size={12} />} />
              <FactorBar label="Reflection" value={form.notesTaken ? 25 : 0} max={25} icon={<Lightbulb size={12} />} />
              <FactorBar label="Writing" value={form.writingPractice ? 20 : 0} max={20} icon={<PenLine size={12} />} />
              <FactorBar label="Speaking" value={form.speakingPractice ? 20 : 0} max={20} icon={<MessageSquare size={12} />} />
              <FactorBar label="New Ideas" value={form.newConcept ? 10 : 0} max={10} icon={<Lightbulb size={12} />} />
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-2">WEEKLY TREND</h3>
            <div className="flex gap-1">
              {trend.map((day, i) => (
                <div key={`${day.date}-${i}`} className="flex-1 rounded flex items-end justify-center" style={{ height: "40px" }}>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${day.score * 100}%`,
                      backgroundColor: day.score >= 0.6 ? "#6a9a74" : day.score >= 0.3 ? "#c39a4e" : "#c97a73",
                      opacity: 0.6,
                    }}
                  />
                </div>
              ))}
              {trend.length === 0 && Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 h-10 bg-[#f7f3ed] rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <ChatGPTPrompt title="Deepen Understanding" promptText={promptText} />
    </div>
  );
}

function FactorBar({ label, value, max, icon }: { label: string; value: number; max: number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#6f685f]">{icon}</span>
      <span className="text-[10px] text-[#6f685f] w-16">{label}</span>
      <div className="flex-1 h-1 bg-[#ece5da] rounded-full overflow-hidden">
        <div className="h-full bg-[#c39a4e] rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="font-mono-data text-[10px] text-[#6f685f] w-6">{value}%</span>
    </div>
  );
}
