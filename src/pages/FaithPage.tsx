import { useState } from "react";
import { trpc } from "@/providers/trpc";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { calcFaithScore } from "@/lib/calculations";
import { Flame } from "lucide-react";

export default function FaithPage() {
  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: faithLog } = trpc.faith.getByDate.useQuery({ date: today });
  const { data: consistency } = trpc.faith.getConsistency.useQuery();

  const upsertFaith = trpc.faith.upsert.useMutation({
    onSuccess: () => {
      utils.faith.getByDate.invalidate({ date: today });
      utils.faith.getConsistency.invalidate();
    },
  });

  const [form, setForm] = useState({
    prayerDone: faithLog?.prayerDone ?? false,
    bibleReading: faithLog?.bibleReading ?? "",
    chapterStudied: faithLog?.chapterStudied ?? "",
    mainLesson: faithLog?.mainLesson ?? "",
    question: faithLog?.question ?? "",
    actionStep: faithLog?.actionStep ?? "",
    temptation: faithLog?.temptation ?? "",
    gratitude: faithLog?.gratitude ?? "",
    churchInvolvement: faithLog?.churchInvolvement ?? false,
  });

  const score = calcFaithScore(form.prayerDone, form.bibleReading, form.mainLesson, form.actionStep);

  const handleSave = () => {
    upsertFaith.mutate({ date: today, ...form });
  };

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
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Faith</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track spiritual discipline, Bible study, prayer, and alignment with your values.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Check-in */}
        <div className="lg:col-span-2 card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">DAILY CHECK-IN</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-[#777777] cursor-pointer">
              <input
                type="checkbox"
                checked={form.prayerDone}
                onChange={(e) => setForm((p) => ({ ...p, prayerDone: e.target.checked }))}
                className="rounded"
              />
              Prayer completed
            </label>
            <label className="flex items-center gap-2 text-sm text-[#777777] cursor-pointer">
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
            {upsertFaith.isPending ? "Saving..." : "Save & Score"}
          </button>
        </div>

        {/* Consistency Tracker */}
        <div className="space-y-4">
          <div className="card-surface p-4 text-center">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">FAITH SCORE</h3>
            <div className="text-4xl font-bold text-[#a855f7]">{score}%</div>
            <div className="text-xs text-[#777777] mt-1">
              {score >= 80 ? "Strong" : score >= 50 ? "Growing" : "Needs attention"}
            </div>
          </div>

          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">THIS WEEK</h3>
            <div className="flex gap-1 justify-center">
              {(consistency?.dailyScores ?? []).map((day, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono-data ${
                    day.score >= 75 ? "bg-[#22c55e]/20 text-[#22c55e]" : day.score >= 50 ? "bg-[#eab308]/20 text-[#eab308]" : "bg-white/[0.04] text-[#444444]"
                  }`}
                  title={`${day.date}: ${day.score}%`}
                >
                  {new Date(day.date).toLocaleDateString("en-US", { weekday: "narrow" })}
                </div>
              ))}
              {(!consistency?.dailyScores || consistency.dailyScores.length === 0) &&
                Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="w-8 h-8 rounded bg-white/[0.04]" />
                ))}
            </div>
            <div className="mt-3 text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-[#777777]">
                <Flame size={14} className="text-[#eab308]" />
                <span>{consistency?.streak ?? 0} day streak</span>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#eaeaea] mb-2">BREAKDOWN</h3>
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
      <span className="text-[#777777] w-20">{label}</span>
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-[#a855f7] rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="font-mono-data text-[#777777] w-8">{value}%</span>
    </div>
  );
}
