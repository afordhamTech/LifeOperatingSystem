import { useState } from "react";
import { trpc } from "@/providers/trpc";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { calcSubstanceScore } from "@/lib/calculations";
import { BookOpen, PenLine, MessageSquare, Lightbulb } from "lucide-react";

export default function SubstancePage() {
  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: learningLog } = trpc.learning.getByDate.useQuery({ date: today });
  const { data: substanceData } = trpc.learning.getSubstanceScore.useQuery();

  const upsertLearning = trpc.learning.upsert.useMutation({
    onSuccess: () => {
      utils.learning.getByDate.invalidate({ date: today });
      utils.learning.getSubstanceScore.invalidate();
    },
  });

  const [form, setForm] = useState({
    readingDone: learningLog?.readingDone ?? "",
    topicStudied: learningLog?.topicStudied ?? "",
    notesTaken: learningLog?.notesTaken ?? "",
    flashcardsMade: learningLog?.flashcardsMade ?? 0,
    conversationPractice: learningLog?.conversationPractice ?? false,
    newConcept: learningLog?.newConcept ?? "",
    questionOfDay: learningLog?.questionOfDay ?? "",
    writingPractice: learningLog?.writingPractice ?? false,
    speakingPractice: learningLog?.speakingPractice ?? false,
  });

  const score = calcSubstanceScore(form.readingDone, form.notesTaken, form.writingPractice, form.speakingPractice, form.newConcept);

  const handleSave = () => {
    upsertLearning.mutate({ date: today, ...form });
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
        <h1 className="text-2xl font-semibold text-[#25313c]">Substance & Learning</h1>
        <p className="text-sm text-[#6f685f] mt-1">
          Build depth, better thinking, better speech, and stronger conversation ability.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Learning Log */}
        <div className="lg:col-span-2 card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">LEARNING LOG</h3>
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
            {upsertLearning.isPending ? "Saving..." : "Save & Score"}
          </button>
        </div>

        {/* Substance Score */}
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

          {/* Weekly Trend */}
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-2">WEEKLY TREND</h3>
            <div className="flex gap-1">
              {(substanceData?.trend ?? []).map((day, i) => (
                <div
                  key={i}
                  className="flex-1 rounded flex items-end justify-center"
                  style={{ height: "40px" }}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(day.score / 1) * 100}%`,
                      backgroundColor: day.score >= 0.6 ? "#6a9a74" : day.score >= 0.3 ? "#c39a4e" : "#c97a73",
                      opacity: 0.6,
                    }}
                  />
                </div>
              ))}
              {(!substanceData?.trend || substanceData.trend.length === 0) &&
                Array.from({ length: 7 }).map((_, i) => (
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

function FactorBar({ label, value, max, icon }: { label: string; value: number; max: number; icon: React.ReactNode }) {
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
