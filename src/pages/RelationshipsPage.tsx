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
import { mergeLocalDraftsWithRemote } from "@/lib/local-draft-merge";
import { Users, Plus, Bell } from "lucide-react";
import {
  EmptyStateCard,
  NextActionCard,
  PageDecisionHeader,
  StatusPill,
} from "@/components/ui-kit";

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

function relationshipQualityLabel(value: number) {
  if (value <= 3) return "Disconnected / Tense";
  if (value <= 7) return "Standard / Good";
  return "Deeply Connected";
}

function relationshipQualityColor(value: number) {
  if (value <= 3) return "#c97a73";
  if (value <= 7) return "#c39a4e";
  return "#6a9a74";
}

function nextActionFromNotes(notes: string) {
  const match = notes.match(/Next action:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
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
    nextAction: "",
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

        const merged = mergeLocalDraftsWithRemote<RelationshipEntry>({
          remote: remoteEntries,
          local: localEntries,
        });
        const uploaded =
          merged.itemsToUpload.length > 0
            ? await Promise.all(
                merged.itemsToUpload.map((entry) => upsertRelationshipEntry(userId, entry)),
              )
            : [];
        const uploadedById = new Map(uploaded.map((entry) => [entry.id, entry]));
        const nextEntries = merged.items.map((entry) => uploadedById.get(entry.id) ?? entry);
        if (!active) return;
        setEntries(nextEntries);
        writeLocalRelationships(nextEntries);

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
  const personNames = people.map((person) => person.personName).sort();

  const handleLog = async () => {
    if (!form.personName.trim()) return;
    const now = new Date().toISOString();
    const entry: RelationshipEntry = {
      id: createLifeeeId(),
      personName: form.personName.trim(),
      lastContact: today,
      conversationQuality: form.conversationQuality,
      unresolvedIssue: form.unresolvedIssue,
      followUpNeeded: form.followUpNeeded,
      notes: [form.notes.trim(), form.nextAction.trim() ? `Next action: ${form.nextAction.trim()}` : ""]
        .filter(Boolean)
        .join("\n"),
      created_at: now,
      updated_at: now,
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

    setForm({
      personName: "",
      conversationQuality: 7,
      unresolvedIssue: "",
      followUpNeeded: false,
      notes: "",
      nextAction: "",
    });
  };

  const resolveFollowUp = async (entry: RelationshipEntry) => {
    const updated = { ...entry, followUpNeeded: false, updated_at: new Date().toISOString() };
    const next = entries.map((item) => (item.id === entry.id ? updated : item));
    setEntries(next);
    writeLocalRelationships(next);
    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = await upsertRelationshipEntry(userId, updated);
        const savedEntries = entries.map((item) => (item.id === entry.id ? saved : item));
        setEntries(savedEntries);
        writeLocalRelationships(savedEntries);
        setSyncStatus("saved");
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not resolve follow-up.");
        setSyncStatus("error");
      }
    }
  };

  const unresolved = entries.filter((entry) => entry.unresolvedIssue.trim());
  const needsSpace = entries.filter(
    (entry) => !entry.followUpNeeded && !entry.unresolvedIssue.trim() && entry.conversationQuality <= 4,
  );
  const radarTitle = followUps[0]?.personName
    ? `${followUps[0].personName} needs follow-up`
    : unresolved[0]?.personName
      ? `${unresolved[0].personName} has unresolved tension`
      : needsSpace[0]?.personName
        ? `${needsSpace[0].personName} may need space`
        : "No urgent relationship action";

  const promptText = `Here is my relationship data:

People remembered: ${people.length}
Follow-ups needed: ${followUps.length}
Needs space: ${needsSpace.length}

Most recent interactions:
${people
  .slice(0, 3)
  .map((p) => `- ${p.personName}: Quality ${p.conversationQuality}/10, Last contact: ${p.lastContact ?? "unknown"}, Notes: ${p.notes || "—"}`)
  .join("\n")}

Help me understand who needs attention and give me mature next messages or actions.`;

  return (
    <div className="space-y-6">
      <PageDecisionHeader
        title="People"
        question="Who needs remembering, repair, follow-through, or space?"
      >
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
          {getSyncLabel(syncStatus)}
        </span>
      </PageDecisionHeader>
      {syncError && <p className="text-xs text-destructive">{syncError}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <NextActionCard
          label="Relationship Radar"
          title={radarTitle}
          detail={
            followUps.length > 0
              ? `Text ${followUps[0].personName}: ${nextActionFromNotes(followUps[0].notes) || followUps[0].unresolvedIssue || "follow through on the noted next action"}.`
              : unresolved.length > 0
                ? `Unresolved tension: ${unresolved.length}. Next mature action: repair simply before making it a bigger conversation.`
                : needsSpace.length > 0
                  ? `Needs space: ${needsSpace.length}. Next mature action: do one respectful action, then let it breathe.`
                  : "Next mature action: remember one useful detail after your next interaction."
          }
          tone={followUps.length || unresolved.length || needsSpace.length ? "warning" : "calm"}
        />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Do Not Overdo
          </div>
          <ul className="mt-2 space-y-1 text-xs text-[#6f685f]">
            <li>Do one mature action, then leave space.</li>
            <li>Do not double-text from anxiety.</li>
            <li>Do not interrogate for certainty.</li>
            <li>Do not force a serious talk if simple repair works.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3 flex items-center gap-2">
            <Users size={14} />
            PEOPLE REMEMBERED
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((person) => (
              <div key={person.id} className="flex items-center justify-between p-3 bg-[#f0ebe2] rounded">
                <div>
                  <div className="text-sm text-[#25313c]">{person.personName}</div>
                  <div className="text-[10px] text-[#6f685f]">
                    Last: {person.lastContact ?? "—"} | Connection: {person.conversationQuality ?? "—"}/10
                  </div>
                  <div className="mt-1 text-[11px] text-[#6f685f]">
                    {person.notes.split("\n")[0] || "No detail saved yet."}
                  </div>
                </div>
                {person.followUpNeeded && <Bell size={14} className="text-[#c39a4e]" />}
              </div>
            ))}
            {people.length === 0 && (
              <EmptyStateCard
                missing="No people remembered yet."
                nextAction="Add one person and the next useful detail to remember."
                why="This helps you follow through without turning people into a tracking system."
              />
            )}
          </div>
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">REMEMBER INTERACTION</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase text-[#6f685f]">Person</span>
              <input
                list="relationship-person-options"
                type="text"
                placeholder="Person name"
                value={form.personName}
                onChange={(e) => setForm((p) => ({ ...p, personName: e.target.value }))}
                className="input-dark w-full"
              />
              <datalist id="relationship-person-options">
                {personNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase text-[#6f685f]">Connection Quality</label>
                <span
                  className="font-mono-data text-[10px]"
                  style={{ color: relationshipQualityColor(form.conversationQuality) }}
                >
                  {form.conversationQuality}/10
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={form.conversationQuality}
                onChange={(e) => setForm((p) => ({ ...p, conversationQuality: Number(e.target.value) }))}
                className="slider-dark"
                style={{ accentColor: relationshipQualityColor(form.conversationQuality) }}
              />
              <div className="mt-1 text-xs text-[#6f685f]">
                {relationshipQualityLabel(form.conversationQuality)}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase text-[#6f685f]">What happened?</span>
              <textarea
                placeholder="Interaction summary"
                value={form.unresolvedIssue}
                onChange={(e) => setForm((p) => ({ ...p, unresolvedIssue: e.target.value }))}
                className="input-dark w-full h-16 resize-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase text-[#6f685f]">Important detail to remember</span>
              <textarea
                placeholder="Important detail, promise, preference, or context"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="input-dark w-full h-16 resize-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase text-[#6f685f]">Next action</span>
              <input
                type="text"
                placeholder="One mature follow-up, repair, or space-giving action"
                value={form.nextAction}
                onChange={(e) => setForm((p) => ({ ...p, nextAction: e.target.value }))}
                className="input-dark w-full"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[#6f685f] cursor-pointer">
              <input
                type="checkbox"
                checked={form.followUpNeeded}
                onChange={(e) => setForm((p) => ({ ...p, followUpNeeded: e.target.checked }))}
                className="rounded"
              />
              Follow-up needed?
            </label>
            <StatusPill tone="neutral">Private by default</StatusPill>
            <button onClick={handleLog} className="btn-primary w-full flex items-center justify-center gap-2">
              <Plus size={14} />
              {syncStatus === "saving" ? "Saving..." : "Remember Interaction"}
            </button>
          </div>
        </div>
      </div>

      {followUps.length > 0 && (
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#c39a4e] mb-3">FOLLOW-UPS NEEDED</h3>
          <div className="space-y-2">
            {followUps.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#e3d8c9] bg-[#fdfaf4] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Bell size={12} className="text-[#c39a4e]" />
                  <span className="text-[#25313c]">
                    Text {f.personName}: {nextActionFromNotes(f.notes) || f.unresolvedIssue || "follow up"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void resolveFollowUp(f)}
                  className="rounded-md border border-[#ddd4c6] bg-white px-2 py-1 text-xs text-[#25313c] hover:bg-[#f7f3ec]"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ChatGPTPrompt title="Relationship Check-in" promptText={promptText} />
    </div>
  );
}
