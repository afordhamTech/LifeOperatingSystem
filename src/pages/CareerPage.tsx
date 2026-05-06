import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { getStatusColor } from "@/components/StatusRing";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  createLifeeeId,
  fetchProofItems,
  getSyncLabel,
  getSyncTone,
  type LifeeeSyncStatus,
  type ProofItem,
  upsertProofItem,
} from "@/lib/lifeee-persistence";
import { calcProofScore } from "@/lib/calculations";
import { Plus, Github, Linkedin, FileText, CheckCircle2, Circle } from "lucide-react";

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

export default function CareerPage() {
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [items, setItems] = useState<ProofItem[]>(() => readLocalProofItems());
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  const [form, setForm] = useState({
    projectName: "",
    artifactType: "code",
    hoursWorked: 1,
    visibility: 5,
    difficulty: 5,
    relevance: 5,
    completion: 5,
  });

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

  const handleAdd = async () => {
    if (!form.projectName.trim()) return;
    const item: ProofItem = {
      id: createLifeeeId(),
      projectName: form.projectName.trim(),
      artifactType: form.artifactType,
      hoursWorked: form.hoursWorked,
      visibility: form.visibility,
      difficulty: form.difficulty,
      relevance: form.relevance,
      completion: form.completion,
      proofScore: calcProofScore(form.visibility, form.difficulty, form.relevance, form.completion),
      githubUpdated: false,
      linkedinUpdated: false,
      resumeBulletAdded: false,
      applicationSubmitted: false,
      mentorContact: "",
      skillPracticed: "",
    };
    const optimistic = [item, ...items];
    setItems(optimistic);
    writeLocalProofItems(optimistic);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = await upsertProofItem(userId, item);
        const next = [saved, ...items];
        setItems(next);
        writeLocalProofItems(next);
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save proof item.");
        setSyncStatus("error");
      }
    } else {
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
    }

    setForm({
      projectName: "",
      artifactType: "code",
      hoursWorked: 1,
      visibility: 5,
      difficulty: 5,
      relevance: 5,
      completion: 5,
    });
  };

  const bulletsToUpdate = items.filter((item) => !item.resumeBulletAdded).length;
  const linkedInUpdates = items.filter((item) => !item.linkedinUpdated).length;
  const proofScore =
    items.length > 0
      ? Math.round((items.reduce((sum, item) => sum + item.proofScore, 0) / items.length) * 100) / 100
      : 0;
  const nextAction =
    bulletsToUpdate > 0
      ? "Update resume with recent project bullets"
      : linkedInUpdates > 0
        ? "Post LinkedIn update about recent work"
        : "Start a new project to build proof";

  const promptText = `Here is my career and proof data:

Projects:
${items
  .map(
    (p) =>
      `- ${p.projectName} (Proof Score: ${Number(p.proofScore).toFixed(1)}, Type: ${p.artifactType})`,
  )
  .join("\n")}

Resume bullets to update: ${bulletsToUpdate}
LinkedIn updates needed: ${linkedInUpdates}
Average proof score: ${proofScore.toFixed(1)}

Tell me what proof is strongest, what I should polish, what I should add to my resume, and what my next career move should be this week.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Career & Proof</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Track whether you are creating evidence that future people can trust.
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
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">ADD PROJECT</h3>
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
              {(["visibility", "difficulty", "relevance", "completion"] as const).map((field) => (
                <div key={field}>
                  <label className="text-[10px] uppercase text-[#6f685f] block mb-1">
                    {field}
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
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Plus size={14} />
              Add Entry
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#25313c]">{items.length}</div>
              <div className="text-[10px] text-[#6f685f]">Projects</div>
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
              <div className="text-[10px] text-[#6f685f]">Avg Proof Score</div>
            </div>
          </div>
          <div className="card-surface p-3">
            <div className="text-xs text-[#6f685f]">Next action:</div>
            <div className="text-sm text-[#6b87ae] mt-1">{nextAction}</div>
          </div>
        </div>
      </div>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">PROJECTS</h3>
        <div className="space-y-3">
          {items.map((project) => (
            <div key={project.id} className="p-3 bg-[#f0ebe2] rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#25313c]">{project.projectName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#6b87ae]/10 text-[#6b87ae] rounded">
                    {project.artifactType}
                  </span>
                </div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${getStatusColor(Number(project.proofScore || 0) * 1.2)}20`,
                    color: getStatusColor(Number(project.proofScore || 0) * 1.2),
                  }}
                >
                  {Number(project.proofScore || 0).toFixed(1)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[
                  { label: "Visibility", value: project.visibility ?? 0 },
                  { label: "Difficulty", value: project.difficulty ?? 0 },
                  { label: "Relevance", value: project.relevance ?? 0 },
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
              <div className="flex items-center gap-3 mt-2">
                {project.githubUpdated ? (
                  <CheckCircle2 size={12} className="text-[#6a9a74]" />
                ) : (
                  <Circle size={12} className="text-[#8c8478]" />
                )}
                <Github size={12} className={project.githubUpdated ? "text-[#6a9a74]" : "text-[#8c8478]"} />
                {project.linkedinUpdated ? (
                  <CheckCircle2 size={12} className="text-[#6a9a74]" />
                ) : (
                  <Circle size={12} className="text-[#8c8478]" />
                )}
                <Linkedin size={12} className={project.linkedinUpdated ? "text-[#6a9a74]" : "text-[#8c8478]"} />
                {project.resumeBulletAdded ? (
                  <CheckCircle2 size={12} className="text-[#6a9a74]" />
                ) : (
                  <Circle size={12} className="text-[#8c8478]" />
                )}
                <FileText size={12} className={project.resumeBulletAdded ? "text-[#6a9a74]" : "text-[#8c8478]"} />
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-8 text-sm text-[#8c8478]">
              No projects yet. Add a proof artifact, shipped feature, or portfolio piece.
            </div>
          )}
        </div>
      </div>

      <ChatGPTPrompt title="Career Analysis" promptText={promptText} />
    </div>
  );
}
