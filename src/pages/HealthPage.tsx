import { useEffect, useRef, useState } from "react";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { calcInjuryRisk } from "@/lib/calculations";
import {
  fetchHealthEntry,
  getHealthRecommendations,
  getSyncLabel,
  getSyncTone,
  type HealthEntry,
  type LifeeeSyncStatus,
  upsertHealthEntry,
} from "@/lib/lifeee-persistence";
import { AlertTriangle, Shield } from "lucide-react";
import {
  CollapsibleSection,
  NextActionCard,
  PageDecisionHeader,
} from "@/components/ui-kit";

const STORAGE_KEY = "lifeee.health_logs.v1";

function defaultHealthEntry(date: string): HealthEntry {
  return {
    date,
    painArea: "",
    painScore: 0,
    painType: "dull",
    painTrigger: "",
    painReliever: "",
    trainingDone: "",
    sleep: 7,
    hydration: 7,
    mobilityDone: false,
    medicationTaken: "",
    doctorVisitNeeded: false,
    painTrend: "stable",
  };
}

function readLocalHealthEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HealthEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalHealthEntry(entry: HealthEntry) {
  if (typeof window === "undefined") return;
  const entries = readLocalHealthEntries().filter((item) => item.date !== entry.date);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...entries]));
}

function getRedFlags(entry: HealthEntry) {
  const flags: string[] = [];
  if (entry.painScore > 7) flags.push("Pain above 7 - no hard training");
  if (entry.painTrend === "increasing") flags.push("Pain increasing - reduce load");
  if (entry.painType === "sharp") flags.push("Sharp pain during movement - stop that movement");
  return flags;
}

function hasMeaningfulHealthDraft(entry: HealthEntry) {
  return (
    Boolean(entry.painArea.trim()) ||
    entry.painScore > 0 ||
    entry.painType !== "dull" ||
    Boolean(entry.painTrigger.trim()) ||
    Boolean(entry.painReliever.trim()) ||
    Boolean(entry.trainingDone.trim()) ||
    entry.sleep !== 7 ||
    entry.hydration !== 7 ||
    entry.mobilityDone ||
    Boolean(entry.medicationTaken.trim()) ||
    entry.doctorVisitNeeded ||
    entry.painTrend !== "stable"
  );
}

export default function HealthPage() {
  const today = new Date().toISOString().split("T")[0];
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<HealthEntry>(() => {
    return readLocalHealthEntries().find((entry) => entry.date === today) ?? defaultHealthEntry(today);
  });
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  // Structured red-flag + movement-specific inputs (UI only — folded into painTrigger live).
  const [checkedFlags, setCheckedFlags] = useState<Set<string>>(new Set());
  const [movementPain, setMovementPain] = useState<Record<string, boolean>>({});
  const [afterWarmup, setAfterWarmup] = useState<"" | "better" | "same" | "worse">("");
  const [freeNote, setFreeNote] = useState("");

  const buildPainTrigger = (
    flags: Set<string>,
    movement: Record<string, boolean>,
    warmup: "" | "better" | "same" | "worse",
    note: string,
  ) => {
    const parts: string[] = [];
    const painfulMoves = Object.entries(movement)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (painfulMoves.length) parts.push(`Pain with: ${painfulMoves.join(", ")}`);
    if (warmup) parts.push(`After warmup: ${warmup}`);
    if (flags.size) parts.push(`Red flags: ${Array.from(flags).join(", ")}`);
    if (note.trim()) parts.push(note.trim());
    return parts.join(" | ");
  };

  const toggleFlag = (flag: string) => {
    setCheckedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      setForm((p) => ({
        ...p,
        painTrigger: buildPainTrigger(next, movementPain, afterWarmup, freeNote),
      }));
      return next;
    });
  };

  const toggleMovement = (move: string) => {
    setMovementPain((prev) => {
      const next = { ...prev, [move]: !prev[move] };
      setForm((p) => ({
        ...p,
        painTrigger: buildPainTrigger(checkedFlags, next, afterWarmup, freeNote),
      }));
      return next;
    });
  };

  const changeWarmup = (warmup: "" | "better" | "same" | "worse") => {
    setAfterWarmup(warmup);
    setForm((p) => ({
      ...p,
      painTrigger: buildPainTrigger(checkedFlags, movementPain, warmup, freeNote),
    }));
  };

  const changeFreeNote = (note: string) => {
    setFreeNote(note);
    setForm((p) => ({
      ...p,
      painTrigger: buildPainTrigger(checkedFlags, movementPain, afterWarmup, note),
    }));
  };

  const RED_FLAGS = [
    "swelling",
    "limping",
    "sharp pain",
    "pain at rest",
    "numbness/tingling",
    "loss of range of motion",
    "pain worsening",
    "pain over 7 days",
    "pain changes movement",
  ];
  const MOVEMENTS = ["jumping", "running", "lifting", "cutting", "walking"];

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localDraft = readLocalHealthEntries().find((entry) => entry.date === today) ?? null;
      const localEntry = localDraft && hasMeaningfulHealthDraft(localDraft) ? localDraft : null;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setForm(localEntry ?? defaultHealthEntry(today));
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const remoteEntry = await fetchHealthEntry(userId, today);
        if (!active) return;

        let nextSyncStatus: LifeeeSyncStatus = "saved";

        if (!remoteEntry && localEntry) {
          const uploaded = (await upsertHealthEntry(userId, localEntry)) ?? localEntry;
          if (!active) return;
          setForm(uploaded);
          writeLocalHealthEntry(uploaded);
        } else if (remoteEntry) {
          setForm(remoteEntry);
          writeLocalHealthEntry(remoteEntry);
        } else {
          setForm(defaultHealthEntry(today));
          nextSyncStatus = "local";
        }

        remoteLoadedRef.current = true;
        setSyncStatus(nextSyncStatus);
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load health log.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, today, userId]);

  const riskScore = calcInjuryRisk(form.painScore, form.painTrend);
  const recommendations = getHealthRecommendations(form);
  const redFlags = getRedFlags(form);
  const seriousFlags = [
    "numbness/tingling",
    "pain at rest",
    "pain over 7 days",
    "pain worsening",
  ].filter((f) => checkedFlags.has(f));
  const trainingDecision =
    form.doctorVisitNeeded || form.painScore >= 8 || seriousFlags.length > 0
      ? "Consider medical evaluation"
      : form.painScore >= 6 || checkedFlags.size > 0 || afterWarmup === "worse"
        ? "Recovery"
        : form.painScore >= 3 ||
            form.painTrend === "increasing" ||
            form.painType === "sharp"
          ? "Modify"
          : "Normal";
  const decisionReason =
    seriousFlags.length > 0
      ? `Red flag${seriousFlags.length > 1 ? "s" : ""}: ${seriousFlags.join(", ")}.`
      : checkedFlags.size > 0
        ? `Red flag noted: ${Array.from(checkedFlags).join(", ")}.`
        : form.painScore > 0
          ? `Based on ${form.painArea || "reported pain"}, ${form.painType} pain, and a ${form.painTrend} trend.`
          : "No pain signals logged today.";

  const handleSave = async () => {
    const entry = { ...form, date: today };
    writeLocalHealthEntry(entry);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = (await upsertHealthEntry(userId, entry)) ?? entry;
        setForm(saved);
        writeLocalHealthEntry(saved);
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save health log.");
        setSyncStatus("error");
      }
    } else {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
    }
  };

  const promptText = `Here is my health and injury data:

Pain area: ${form.painArea || "None reported"}
Pain score: ${form.painScore}/10
Pain trend: ${form.painTrend}
Pain type: ${form.painType}
What makes it worse: ${form.painTrigger || "—"}
What makes it better: ${form.painReliever || "—"}
Training load: ${form.trainingDone || "—"}
Sleep: ${form.sleep}h
Hydration: ${form.hydration}/10
Mobility done: ${form.mobilityDone ? "Yes" : "No"}
Injury risk: ${riskScore.toFixed(1)}/10

Help me decide whether to train, modify training, recover, or seek medical help. Do not diagnose me. Give me safe next steps.`;

  return (
    <div className="space-y-6">
      <PageDecisionHeader
        title="Health & Injury"
        question="Should I train normally, modify, recover, or seek help?"
      >
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
          {getSyncLabel(syncStatus)}
        </span>
      </PageDecisionHeader>
      {syncError && <p className="text-xs text-destructive">{syncError}</p>}

      <NextActionCard
        label="Training decision"
        title={trainingDecision}
        tone={trainingDecision === "Normal" ? "calm" : "warning"}
        detail={`${decisionReason} Consider medical evaluation if symptoms persist or worsen.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">PAIN TRACKER</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Pain Area</label>
              <input
                type="text"
                value={form.painArea}
                onChange={(e) => setForm((p) => ({ ...p, painArea: e.target.value }))}
                placeholder="e.g., left knee"
                className="input-dark w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase text-[#6f685f]">Pain Score</label>
                <span className="font-mono-data text-[10px]" style={{ color: getStatusColor(10 - form.painScore) }}>
                  {form.painScore}/10
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={form.painScore}
                onChange={(e) => setForm((p) => ({ ...p, painScore: Number(e.target.value) }))}
                className="slider-dark"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Pain Type</label>
              <select
                value={form.painType}
                onChange={(e) => setForm((p) => ({ ...p, painType: e.target.value }))}
                className="input-dark w-full"
              >
                <option value="sharp">Sharp</option>
                <option value="dull">Dull</option>
                <option value="aching">Aching</option>
                <option value="burning">Burning</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Trend</label>
              <select
                value={form.painTrend}
                onChange={(e) => setForm((p) => ({ ...p, painTrend: e.target.value }))}
                className="input-dark w-full"
              >
                <option value="decreasing">Decreasing</option>
                <option value="stable">Stable</option>
                <option value="increasing">Increasing</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-2">
                Red flags
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {RED_FLAGS.map((flag) => (
                  <label
                    key={flag}
                    className="flex items-center gap-2 text-xs text-[#6f685f] capitalize"
                  >
                    <input
                      type="checkbox"
                      checked={checkedFlags.has(flag)}
                      onChange={() => toggleFlag(flag)}
                      className="rounded"
                    />
                    {flag}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-2">
                Pain with movement
              </label>
              <div className="flex flex-wrap gap-2">
                {MOVEMENTS.map((move) => (
                  <button
                    key={move}
                    type="button"
                    onClick={() => toggleMovement(move)}
                    className={`rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors ${
                      movementPain[move]
                        ? "bg-[#c97a73]/15 text-[#c97a73]"
                        : "bg-[#f0ebe2] text-[#6f685f]"
                    }`}
                  >
                    {move}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                After warmup
              </label>
              <select
                value={afterWarmup}
                onChange={(e) =>
                  changeWarmup(e.target.value as "" | "better" | "same" | "worse")
                }
                className="input-dark w-full"
              >
                <option value="">Not noted</option>
                <option value="better">Better after warmup</option>
                <option value="same">Same after warmup</option>
                <option value="worse">Worse after warmup</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                Other movement notes
              </label>
              <textarea
                value={freeNote}
                onChange={(e) => changeFreeNote(e.target.value)}
                placeholder="Anything else worth noting"
                className="input-dark w-full h-16 resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Relievers</label>
              <textarea
                value={form.painReliever}
                onChange={(e) => setForm((p) => ({ ...p, painReliever: e.target.value }))}
                placeholder="What helps?"
                className="input-dark w-full h-16 resize-none"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-[#6f685f]">
                <input
                  type="checkbox"
                  checked={form.mobilityDone}
                  onChange={(e) => setForm((p) => ({ ...p, mobilityDone: e.target.checked }))}
                  className="rounded"
                />
                Mobility done
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6f685f]">
                <input
                  type="checkbox"
                  checked={form.doctorVisitNeeded}
                  onChange={(e) => setForm((p) => ({ ...p, doctorVisitNeeded: e.target.checked }))}
                  className="rounded"
                />
                Doctor needed
              </label>
            </div>
            <button onClick={handleSave} className="btn-primary w-full">
              {syncStatus === "saving" ? "Saving..." : "Log & Assess"}
            </button>
          </div>
        </div>

        <CollapsibleSection title="Why this recommendation">
          <div className="flex flex-col items-center">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3 w-full">Risk calculation</h3>
          <StatusRing score={riskScore} size={120} strokeWidth={6} />
          <div className="mt-4 w-full space-y-2">
            <FactorBar label="Pain Score" value={form.painScore} max={10} color="#c97a73" />
            <FactorBar
              label="Pain Trend"
              value={form.painTrend === "increasing" ? 8 : form.painTrend === "stable" ? 5 : 2}
              max={10}
              color="#c39a4e"
            />
            <FactorBar label="Training Load" value={5} max={10} color="#6b87ae" />
            <FactorBar label="Recovery Deficit" value={3} max={10} color="#9a7bbd" />
          </div>
          </div>
        </CollapsibleSection>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">SAFE NEXT STEPS</h3>
          {recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Shield size={12} className="text-[#c39a4e] mt-0.5 flex-shrink-0" />
                  <span className="text-[#6f685f]">{rec}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#6a9a74]">No specific recommendations. Stay consistent.</p>
          )}

          {redFlags.length > 0 && (
            <div className="mt-4 p-3 bg-[#c97a73]/10 rounded">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={12} className="text-[#c97a73]" />
                <span className="text-xs font-semibold text-[#c97a73]">RED FLAGS</span>
              </div>
              {redFlags.map((flag, i) => (
                <div key={i} className="text-xs text-[#c97a73] mb-1">
                  {flag}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ChatGPTPrompt title="Health Assessment" promptText={promptText} />
    </div>
  );
}

function FactorBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#6f685f] w-24">{label}</span>
      <div className="flex-1 h-1.5 bg-[#ece5da] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono-data text-[10px] text-[#6f685f] w-6">{value}</span>
    </div>
  );
}
