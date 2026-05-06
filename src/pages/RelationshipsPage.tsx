import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  createLifeeeId,
  fetchRelationshipEntries,
  getSyncLabel,
  getSyncTone,
  type LifeeeSyncStatus,
  type RelationshipEntry,
  upsertRelationshipEntry,
} from "@/lib/lifeee-persistence";
import { Users, Plus, Bell } from "lucide-react";

const STORAGE_KEY = "lifeee.relationship_logs.v1";

function readLocalRelationships() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RelationshipEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalRelationships(entries: RelationshipEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export default function RelationshipsPage() {
  const today = new Date().toISOString().split("T")[0];
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [entries, setEntries] = useState<RelationshipEntry[]>(() => readLocalRelationships());
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  const [form, setForm] = useState({
    personName: "",
    conversationQuality: 7,
    unresolvedIssue: "",
    followUpNeeded: false,
    notes: "",
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalRelationships();

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setEntries(localEntries);
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const remoteEntries = await fetchRelationshipEntries(userId);
        if (!active) return;

        if (remoteEntries.length === 0 && localEntries.length > 0) {
          const uploaded = await Promise.all(localEntries.map((entry) => upsertRelationshipEntry(userId, entry)));
          if (!active) return;
          setEntries(uploaded);
          writeLocalRelationships(uploaded);
        } else {
          setEntries(remoteEntries);
          writeLocalRelationships(remoteEntries);
        }

        remoteLoadedRef.current = true;
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load relationships.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  const people = Array.from(
    entries.reduce((map, entry) => {
      if (!map.has(entry.personName)) map.set(entry.personName, entry);
      return map;
    }, new Map<string, RelationshipEntry>()),
  ).map(([, entry]) => entry);
  const followUps = entries.filter((entry) => entry.followUpNeeded);

  const handleLog = async () => {
    if (!form.personName.trim()) return;
    const entry: RelationshipEntry = {
      id: createLifeeeId(),
      personName: form.personName.trim(),
      lastContact: today,
      conversationQuality: form.conversationQuality,
      unresolvedIssue: form.unresolvedIssue,
      followUpNeeded: form.followUpNeeded,
      notes: form.notes,
    };
    const optimistic = [entry, ...entries];
    setEntries(optimistic);
    writeLocalRelationships(optimistic);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = await upsertRelationshipEntry(userId, entry);
        const next = [saved, ...entries];
        setEntries(next);
        writeLocalRelationships(next);
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save relationship log.");
        setSyncStatus("error");
      }
    } else {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
    }

    setForm({ personName: "", conversationQuality: 7, unresolvedIssue: "", followUpNeeded: false, notes: "" });
  };

  const promptText = `Here is my relationship data:

People tracked: ${people.length}
Follow-ups needed: ${followUps.length}

Most recent interactions:
${people
  .slice(0, 3)
  .map((p) => `- ${p.personName}: Quality ${p.conversationQuality}/10, Last contact: ${p.lastContact ?? "unknown"}`)
  .join("\n")}

Help me understand who needs attention and give me mature next messages or actions.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Relationships</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Track communication, friendships, family, and social presence.
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
            {getSyncLabel(syncStatus)}
          </span>
        </div>
        {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3 flex items-center gap-2">
            <Users size={14} />
            PEOPLE
          </h3>
          <div className="space-y-2">
            {people.map((person) => (
              <div key={person.id} className="flex items-center justify-between p-2 bg-[#f0ebe2] rounded">
                <div>
                  <div className="text-sm text-[#25313c]">{person.personName}</div>
                  <div className="text-[10px] text-[#6f685f]">
                    Last: {person.lastContact ?? "—"} | Quality: {person.conversationQuality ?? "—"}/10
                  </div>
                </div>
                {person.followUpNeeded && <Bell size={14} className="text-[#c39a4e]" />}
              </div>
            ))}
            {people.length === 0 && (
              <div className="text-sm text-[#8c8478] text-center py-4">
                No people tracked yet. Add someone you want to keep warm.
              </div>
            )}
          </div>
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">LOG INTERACTION</h3>
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
                <label className="text-[10px] uppercase text-[#6f685f]">Conversation Quality</label>
                <span className="font-mono-data text-[10px] text-[#6b87ae]">{form.conversationQuality}/10</span>
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
            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="input-dark w-full h-16 resize-none"
            />
            <label className="flex items-center gap-2 text-xs text-[#6f685f] cursor-pointer">
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
              {syncStatus === "saving" ? "Saving..." : "Log Interaction"}
            </button>
          </div>
        </div>
      </div>

      {followUps.length > 0 && (
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#c39a4e] mb-3">FOLLOW-UPS NEEDED</h3>
          <div className="space-y-2">
            {followUps.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                <Bell size={12} className="text-[#c39a4e]" />
                <span className="text-[#25313c]">{f.personName}</span>
                <span className="text-[#6f685f]">{f.unresolvedIssue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ChatGPTPrompt title="Relationship Advice" promptText={promptText} />
    </div>
  );
}
