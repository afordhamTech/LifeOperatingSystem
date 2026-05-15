import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { EmptyState } from "@/components/EmptyState";
import { PrivacyChip } from "@/components/PrivacyChip";
import { getStatusColor } from "@/components/StatusRing";
import { SyncBadge } from "@/components/SyncBadge";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  createLifeeeId,
  deleteProofItem,
  fetchProofItems,
  type LifeeeSyncStatus,
  type ProofItem,
  upsertProofItem,
} from "@/lib/lifeee-persistence";
import { calcProofScore } from "@/lib/calculations";
import {
  CheckCircle2,
  Circle,
  FileText,
  Github,
  Linkedin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  CollapsibleSection,
  NextActionCard,
  PageDecisionHeader,
} from "@/components/ui-kit";

const STORAGE_KEY = "lifeee.proof_items.v1";

function readLocalProofItems() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProofItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocalProofItems(items: ProofItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

type ProofForm = {
  projectName: string;
  artifactType: string;
  hoursWorked: number;
  visibility: number;
  difficulty: number;
  relevance: number;
  completion: number;
  privacyLayer: string;
};

const emptyProofForm: ProofForm = {
  projectName: "",
  artifactType: "code",
  hoursWorked: 1,
  visibility: 5,
  difficulty: 5,
  relevance: 5,
  completion: 5,
  privacyLayer: "Private",
};

function formFromProofItem(item: ProofItem): ProofForm {
  return {
    projectName: item.projectName,
    artifactType: item.artifactType,
    hoursWorked: item.hoursWorked,
    visibility: item.visibility,
    difficulty: item.difficulty,
    relevance: item.relevance,
    completion: item.completion,
    privacyLayer: item.privacyLayer,
  };
}

export default function CareerPage() {
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [items, setItems] = useState<ProofItem[]>(() => readLocalProofItems());
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  const [form, setForm] = useState<ProofForm>(emptyProofForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localItems = readLocalProofItems();

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setItems(localItems);
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const remoteItems = await fetchProofItems(userId);
        if (!active) return;

        if (remoteItems.length === 0 && localItems.length > 0) {
          const uploaded = await Promise.all(localItems.map((item) => upsertProofItem(userId, item)));
          if (!active) return;
          setItems(uploaded);
          writeLocalProofItems(uploaded);
        } else {
          setItems(remoteItems);
          writeLocalProofItems(remoteItems);
        }

        remoteLoadedRef.current = true;
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load proof items.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, sessionLoading, userId]);

  const persistProofItem = async (item: ProofItem, fallback = "Could not save proof item.") => {
    if (!hasSupabaseConfig || !userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return item;
    }

    setSyncStatus("saving");
    setSyncError(null);

    try {
      const saved = await upsertProofItem(userId, item);
      setSyncStatus("saved");
      return saved;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : fallback);
      setSyncStatus("error");
      return null;
    }
  };

  const handleSave = async () => {
    if (!form.projectName.trim()) return;
    const existing = editingId ? items.find((item) => item.id === editingId) : null;
    const item: ProofItem = {
      id: editingId ?? createLifeeeId(),
      projectName: form.projectName.trim(),
      artifactType: form.artifactType,
      hoursWorked: form.hoursWorked,
      visibility: form.visibility,
      difficulty: form.difficulty,
      relevance: form.relevance,
      completion: form.completion,
      proofScore: calcProofScore(form.visibility, form.difficulty, form.relevance, form.completion),
      githubUpdated: existing?.githubUpdated ?? false,
      linkedinUpdated: existing?.linkedinUpdated ?? false,
      resumeBulletAdded: existing?.resumeBulletAdded ?? false,
      applicationSubmitted: existing?.applicationSubmitted ?? false,
      mentorContact: existing?.mentorContact ?? "",
      skillPracticed: existing?.skillPracticed ?? "",
      privacyLayer: form.privacyLayer,
    };
    const optimistic = editingId
      ? items.map((current) => (current.id === editingId ? item : current))
      : [item, ...items];
    setItems(optimistic);
    writeLocalProofItems(optimistic);

    const saved = await persistProofItem(item);
    if (saved) {
      const next = editingId
        ? items.map((current) => (current.id === editingId ? saved : current))
        : [saved, ...items];
      setItems(next);
      writeLocalProofItems(next);
    }

    setForm(emptyProofForm);
    setEditingId(null);
  };

  const startEdit = (item: ProofItem) => {
    setEditingId(item.id);
    setForm(formFromProofItem(item));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyProofForm);
  };

  const removeProject = async (item: ProofItem) => {
    const next = items.filter((current) => current.id !== item.id);
    setItems(next);
    writeLocalProofItems(next);

    if (!hasSupabaseConfig || !userId || !remoteLoadedRef.current) {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
      return;
    }

    setSyncStatus("saving");
    setSyncError(null);

    try {
      await deleteProofItem(userId, item.id);
      setSyncStatus("saved");
    } catch (error) {
      setItems(items);
      writeLocalProofItems(items);
      setSyncError(error instanceof Error ? error.message : "Could not delete proof item.");
      setSyncStatus("error");
    }
  };

  const toggleProjectFlag = async (
    item: ProofItem,
    field: "githubUpdated" | "linkedinUpdated" | "resumeBulletAdded",
  ) => {
    const updated = { ...item, [field]: !item[field] };
    const next = items.map((current) => (current.id === item.id ? updated : current));
    setItems(next);
    writeLocalProofItems(next);
    const saved = await persistProofItem(updated, "Could not update proof item.");
    if (saved) {
      const savedItems = items.map((current) => (current.id === item.id ? saved : current));
      setItems(savedItems);
      writeLocalProofItems(savedItems);
    }
  };

  const bulletsToUpdate = items.filter((item) => !item.resumeBulletAdded).length;
  const linkedInUpdates = items.filter((item) => !item.linkedinUpdated).length;
  const proofScore =
    items.length > 0
      ? Math.round((items.reduce((sum, item) => sum + item.proofScore, 0) / items.length) * 100) / 100
      : 0;
  const strongestProof = [...items].sort(
    (a, b) => Number(b.proofScore ?? 0) - Number(a.proofScore ?? 0),
  )[0];
  const nextAction =
    bulletsToUpdate > 0
      ? "Update resume with recent project bullets"
      : linkedInUpdates > 0
        ? "Post LinkedIn update about recent work"
        : "Start a new project to build proof";

  const promptText = `Here is my career and proof data:

Proof Library:
${items
  .map(
    (p) =>
      `- ${p.projectName} (Proof Score: ${Number(p.proofScore).toFixed(1)}, Type: ${p.artifactType})`,
  )
  .join("\n")}

Resume bullets to update: ${bulletsToUpdate}
LinkedIn updates needed: ${linkedInUpdates}
Average proof strength: ${proofScore.toFixed(1)}

Tell me what proof is strongest, what I should polish, what I should add to my resume, and what my next career move should be this week.`;

  return (
    <div className="space-y-6">
      <PageDecisionHeader
        title="Career & Proof"
        question="What proof do I have, and how do I turn it into leverage?"
      >
        <SyncBadge status={syncStatus} />
      </PageDecisionHeader>
      {syncError && <p className="text-xs text-destructive">{syncError}</p>}

      <NextActionCard
        label="Strongest proof"
        title={strongestProof?.projectName || "Add one proof item"}
        detail={
          strongestProof
            ? `Proof strength ${Number(strongestProof.proofScore || 0).toFixed(1)}. Next leverage move: ${nextAction}.`
            : "Add a shipped artifact, resume story, GitHub artifact, or project result."
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#25313c]">
              {editingId ? "EDIT PROOF" : "ADD PROOF"}
            </h3>
            {editingId ? (
              <button
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 rounded-md border border-[#ddd4c6] px-2 py-1 text-xs text-[#6f685f] hover:bg-[#f7f3ec]"
              >
                <X size={12} />
                Cancel
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Project name"
              value={form.projectName}
              onChange={(e) => setForm((p) => ({ ...p, projectName: e.target.value }))}
              className="input-dark w-full"
            />
            <select
              value={form.artifactType}
              onChange={(e) => setForm((p) => ({ ...p, artifactType: e.target.value }))}
              className="input-dark w-full"
            >
              <option value="code">Code</option>
              <option value="design">Design</option>
              <option value="writing">Writing</option>
              <option value="video">Video</option>
              <option value="other">Other</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] uppercase text-[#6f685f]">
                Hours worked
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.hoursWorked}
                  onChange={(e) => setForm((p) => ({ ...p, hoursWorked: Number(e.target.value) }))}
                  className="input-dark mt-1 w-full"
                />
              </label>
              <label className="text-[10px] uppercase text-[#6f685f]">
                Privacy
                <select
                  value={form.privacyLayer}
                  onChange={(e) => setForm((p) => ({ ...p, privacyLayer: e.target.value }))}
                  className="input-dark mt-1 w-full"
                >
                  <option value="Private">Private</option>
                  <option value="Mentor Shareable">Mentor Shareable</option>
                  <option value="Public Proof">Public Proof</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["visibility", "difficulty", "relevance", "completion"] as const).map((field) => (
                <div key={field}>
                  <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                    {field === "visibility"
                      ? "Showability"
                      : field === "relevance"
                        ? "Direction fit"
                        : field}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={form[field]}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [field]: Number(e.target.value) }))
                    }
                    className="slider-dark"
                  />
                  <span className="text-[10px] text-[#6f685f]">{form[field]}/10</span>
                </div>
              ))}
            </div>
            <button onClick={() => void handleSave()} className="btn-primary flex items-center gap-2">
              {editingId ? <CheckCircle2 size={14} /> : <Plus size={14} />}
              {editingId ? "Save Changes" : "Add Proof"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#25313c]">{items.length}</div>
              <div className="text-[10px] text-[#6f685f]">Proof Library</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#c39a4e]">{bulletsToUpdate}</div>
              <div className="text-[10px] text-[#6f685f]">Resume Bullets</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#6b87ae]">{linkedInUpdates}</div>
              <div className="text-[10px] text-[#6f685f]">LinkedIn Updates</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#9a7bbd]">{proofScore.toFixed(1)}</div>
              <div className="text-[10px] text-[#6f685f]">Average Proof Strength</div>
            </div>
          </div>
          <div className="card-surface p-3">
            <div className="text-xs text-[#6f685f]">Next leverage move:</div>
            <div className="text-sm text-[#6b87ae] mt-1">{nextAction}</div>
          </div>
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">PROOF LIBRARY</h3>
        <div className="space-y-3">
          {items.map((project) => (
            <div key={project.id} className="p-3 bg-[#f0ebe2] rounded">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#25313c]">{project.projectName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#6b87ae]/10 text-[#6b87ae] rounded">
                    {project.artifactType}
                  </span>
                  <PrivacyChip label={project.privacyLayer} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${getStatusColor(Number(project.proofScore || 0) * 1.2)}20`,
                      color: getStatusColor(Number(project.proofScore || 0) * 1.2),
                    }}
                  >
                    {Number(project.proofScore || 0).toFixed(1)}
                  </span>
                  <button
                    onClick={() => startEdit(project)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#ddd4c6] bg-white px-2 py-1 text-xs text-[#25313c] hover:bg-[#f7f3ec]"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => void removeProject(project)}
                    className="rounded-md border border-[#ddd4c6] bg-white p-1 text-[#8c8478] hover:bg-[#f7f3ec] hover:text-destructive"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-[#6f685f]">
                {Number(project.hoursWorked ?? 0)} hours worked
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[
                  { label: "Showability", value: project.visibility ?? 0 },
                  { label: "Difficulty", value: project.difficulty ?? 0 },
                  { label: "Direction fit", value: project.relevance ?? 0 },
                  { label: "Completion", value: project.completion ?? 0 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-[9px] text-[#6f685f]">{item.label}</div>
                    <div className="h-1 bg-[#ece5da] rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full bg-[#9a7bbd] rounded-full"
                        style={{ width: `${(item.value / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <CollapsibleSection title="Leverage checklist" defaultOpen={false} className="mt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void toggleProjectFlag(project, "githubUpdated")}
                  className="inline-flex items-center gap-1 rounded-md border border-[#ddd4c6] bg-white px-2 py-1 text-[11px] text-[#6f685f] hover:bg-[#f7f3ec]"
                >
                  {project.githubUpdated ? (
                    <CheckCircle2 size={12} className="text-[#6a9a74]" />
                  ) : (
                    <Circle size={12} className="text-[#8c8478]" />
                  )}
                  <Github size={12} className={project.githubUpdated ? "text-[#6a9a74]" : "text-[#8c8478]"} />
                  GitHub
                </button>
                <button
                  onClick={() => void toggleProjectFlag(project, "linkedinUpdated")}
                  className="inline-flex items-center gap-1 rounded-md border border-[#ddd4c6] bg-white px-2 py-1 text-[11px] text-[#6f685f] hover:bg-[#f7f3ec]"
                >
                  {project.linkedinUpdated ? (
                    <CheckCircle2 size={12} className="text-[#6a9a74]" />
                  ) : (
                    <Circle size={12} className="text-[#8c8478]" />
                  )}
                  <Linkedin size={12} className={project.linkedinUpdated ? "text-[#6a9a74]" : "text-[#8c8478]"} />
                  LinkedIn
                </button>
                <button
                  onClick={() => void toggleProjectFlag(project, "resumeBulletAdded")}
                  className="inline-flex items-center gap-1 rounded-md border border-[#ddd4c6] bg-white px-2 py-1 text-[11px] text-[#6f685f] hover:bg-[#f7f3ec]"
                >
                  {project.resumeBulletAdded ? (
                    <CheckCircle2 size={12} className="text-[#6a9a74]" />
                  ) : (
                    <Circle size={12} className="text-[#8c8478]" />
                  )}
                  <FileText size={12} className={project.resumeBulletAdded ? "text-[#6a9a74]" : "text-[#8c8478]"} />
                  Resume
                </button>
              </div>
              </CollapsibleSection>
            </div>
          ))}
          {items.length === 0 && (
            <EmptyState
              title="No proof items yet"
              description="Add a proof artifact, shipped feature, or portfolio piece."
            />
          )}
        </div>
      </div>

      <ChatGPTPrompt title="Career Leverage" promptText={promptText} />
    </div>
  );
}
