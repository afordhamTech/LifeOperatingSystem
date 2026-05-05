import { useState } from "react";
import { trpc } from "@/providers/trpc";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { Users, Plus, Bell } from "lucide-react";

export default function RelationshipsPage() {
  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: people } = trpc.relationships.listPeople.useQuery();
  const { data: followUps } = trpc.relationships.getFollowUps.useQuery();
  const logInteraction = trpc.relationships.logInteraction.useMutation({
    onSuccess: () => {
      utils.relationships.listPeople.invalidate();
      utils.relationships.getFollowUps.invalidate();
    },
  });

  const [form, setForm] = useState({
    personName: "",
    conversationQuality: 7,
    unresolvedIssue: "",
    followUpNeeded: false,
    notes: "",
  });

  const handleLog = () => {
    if (!form.personName) return;
    logInteraction.mutate({ date: today, ...form });
    setForm({ personName: "", conversationQuality: 7, unresolvedIssue: "", followUpNeeded: false, notes: "" });
  };

  const promptText = `Here is my relationship data:

People tracked: ${people?.length ?? 0}
Follow-ups needed: ${followUps?.length ?? 0}

Most recent interactions:
${people?.slice(0, 3).map((p) => `- ${p.personName}: Quality ${p.conversationQuality}/10, Last contact: ${p.lastContact ?? "unknown"}`).join("\n")}

Help me understand who needs attention and give me mature next messages or actions.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Relationships</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track communication, friendships, family, and social presence.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* People List */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3 flex items-center gap-2">
            <Users size={14} />
            PEOPLE
          </h3>
          <div className="space-y-2">
            {(people ?? []).map((person) => (
              <div key={person.id} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded">
                <div>
                  <div className="text-sm text-[#eaeaea]">{person.personName}</div>
                  <div className="text-[10px] text-[#777777]">
                    Last: {person.lastContact ?? "—"} | Quality: {person.conversationQuality ?? "—"}/10
                  </div>
                </div>
                {person.followUpNeeded && (
                  <Bell size={14} className="text-[#eab308]" />
                )}
              </div>
            ))}
            {(!people || people.length === 0) && (
              <div className="text-sm text-[#444444] text-center py-4">No people tracked yet</div>
            )}
          </div>
        </div>

        {/* Log Interaction */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">LOG INTERACTION</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Person name"
              value={form.personName}
              onChange={(e) => setForm((p) => ({ ...p, personName: e.target.value }))}
              className="input-dark w-full"
            />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase text-[#777777]">Conversation Quality</label>
                <span className="font-mono-data text-[10px] text-[#3b82f6]">{form.conversationQuality}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={form.conversationQuality}
                onChange={(e) => setForm((p) => ({ ...p, conversationQuality: Number(e.target.value) }))}
                className="slider-dark"
              />
            </div>
            <textarea
              placeholder="Unresolved issue (optional)"
              value={form.unresolvedIssue}
              onChange={(e) => setForm((p) => ({ ...p, unresolvedIssue: e.target.value }))}
              className="input-dark w-full h-16 resize-none"
            />
            <label className="flex items-center gap-2 text-xs text-[#777777] cursor-pointer">
              <input
                type="checkbox"
                checked={form.followUpNeeded}
                onChange={(e) => setForm((p) => ({ ...p, followUpNeeded: e.target.checked }))}
                className="rounded"
              />
              Follow-up needed
            </label>
            <button onClick={handleLog} className="btn-primary w-full flex items-center justify-center gap-2">
              <Plus size={14} />
              Log Interaction
            </button>
          </div>
        </div>
      </div>

      {/* Follow-ups */}
      {followUps && followUps.length > 0 && (
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eab308] mb-3">FOLLOW-UPS NEEDED</h3>
          <div className="space-y-2">
            {followUps.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                <Bell size={12} className="text-[#eab308]" />
                <span className="text-[#eaeaea]">{f.personName}</span>
                <span className="text-[#777777]">{f.unresolvedIssue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ChatGPTPrompt title="Relationship Advice" promptText={promptText} />
    </div>
  );
}
