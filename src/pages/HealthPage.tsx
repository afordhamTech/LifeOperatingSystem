import { useState } from "react";
import { trpc } from "@/providers/trpc";
import StatusRing, { getStatusColor } from "@/components/StatusRing";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { calcInjuryRisk } from "@/lib/calculations";
import { AlertTriangle, Shield } from "lucide-react";

export default function HealthPage() {
  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: healthLog } = trpc.health.getByDate.useQuery({ date: today });
  const { data: riskData } = trpc.health.getRisk.useQuery({ date: today });

  const upsertHealth = trpc.health.upsert.useMutation({
    onSuccess: () => {
      utils.health.getByDate.invalidate({ date: today });
      utils.health.getRisk.invalidate({ date: today });
    },
  });

  const [form, setForm] = useState({
    painArea: healthLog?.painArea ?? "",
    painScore: healthLog?.painScore ?? 0,
    painType: healthLog?.painType ?? "dull",
    painTrigger: healthLog?.painTrigger ?? "",
    painReliever: healthLog?.painReliever ?? "",
    trainingDone: healthLog?.trainingDone ?? "",
    sleep: healthLog?.sleep ? Number(healthLog.sleep) : 7,
    hydration: healthLog?.hydration ?? 7,
    mobilityDone: healthLog?.mobilityDone ?? false,
    medicationTaken: healthLog?.medicationTaken ?? "",
    doctorVisitNeeded: healthLog?.doctorVisitNeeded ?? false,
    painTrend: healthLog?.painTrend ?? "stable",
  });

  const riskScore = calcInjuryRisk(form.painScore, form.painTrend);

  const handleSave = () => {
    upsertHealth.mutate({ date: today, ...form });
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
      <div className="border-b border-[#ddd4c6] pb-4">
        <h1 className="text-2xl font-semibold text-[#25313c]">Health & Injury</h1>
        <p className="text-sm text-[#6f685f] mt-1">
          Track pain, recurring issues, recovery, and whether you are ignoring warning signals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pain Input */}
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
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Triggers</label>
              <textarea
                value={form.painTrigger}
                onChange={(e) => setForm((p) => ({ ...p, painTrigger: e.target.value }))}
                placeholder="What makes it worse?"
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
              {upsertHealth.isPending ? "Saving..." : "Log & Assess"}
            </button>
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="card-surface p-4 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3 w-full">INJURY RISK</h3>
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

        {/* Recommendations */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">RECOMMENDATIONS</h3>
          {riskData?.recommendations && riskData.recommendations.length > 0 ? (
            <div className="space-y-2">
              {riskData.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Shield size={12} className="text-[#c39a4e] mt-0.5 flex-shrink-0" />
                  <span className="text-[#6f685f]">{rec}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#6a9a74]">No specific recommendations. Stay consistent.</p>
          )}

          {/* Red Flags */}
          {(riskData?.redFlags ?? []).length > 0 && (
            <div className="mt-4 p-3 bg-[#c97a73]/10 rounded">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={12} className="text-[#c97a73]" />
                <span className="text-xs font-semibold text-[#c97a73]">RED FLAGS</span>
              </div>
              {(riskData?.redFlags ?? []).map((flag, i) => (
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
