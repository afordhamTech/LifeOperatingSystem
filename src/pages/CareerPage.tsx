import { useState } from "react";
import { trpc } from "@/providers/trpc";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { getStatusColor } from "@/components/StatusRing";
import { Plus, Github, Linkedin, FileText, CheckCircle2, Circle } from "lucide-react";

export default function CareerPage() {
  const utils = trpc.useUtils();
  const { data: dashboard } = trpc.career.getDashboard.useQuery();
  const createArtifact = trpc.career.create.useMutation({
    onSuccess: () => utils.career.getDashboard.invalidate(),
  });

  const [form, setForm] = useState({
    projectName: "",
    artifactType: "code",
    hoursWorked: 1,
    visibility: 5,
    difficulty: 5,
    relevance: 5,
    completion: 5,
  });

  const handleAdd = () => {
    if (!form.projectName) return;
    createArtifact.mutate(form);
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

  const promptText = `Here is my career and proof data:

Projects:
${dashboard?.projects
  ?.map(
    (p) =>
      `- ${p.projectName} (Proof Score: ${Number(p.proofScore).toFixed(1)}, Type: ${p.artifactType})`
  )
  .join("\n")}

Resume bullets to update: ${dashboard?.bulletsToUpdate ?? 0}
LinkedIn updates needed: ${dashboard?.linkedInUpdates ?? 0}
Average proof score: ${dashboard?.proofScore?.toFixed(1) ?? 0}

Tell me what proof is strongest, what I should polish, what I should add to my resume, and what my next career move should be this week.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Career & Proof</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track whether you are creating evidence that future people can trust.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add Project */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">ADD PROJECT</h3>
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
                  <label className="text-[10px] uppercase text-[#777777] block mb-1">
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
                  <span className="text-[10px] text-[#777777]">{form[field]}/10</span>
                </div>
              ))}
            </div>
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Plus size={14} />
              Add Entry
            </button>
          </div>
        </div>

        {/* Dashboard Widgets */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#eaeaea]">{dashboard?.projects?.length ?? 0}</div>
              <div className="text-[10px] text-[#777777]">Projects</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#eab308]">{dashboard?.bulletsToUpdate ?? 0}</div>
              <div className="text-[10px] text-[#777777]">Resume Bullets</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#3b82f6]">{dashboard?.linkedInUpdates ?? 0}</div>
              <div className="text-[10px] text-[#777777]">LinkedIn Updates</div>
            </div>
            <div className="card-surface p-3 text-center">
              <div className="text-xl font-bold text-[#a855f7]">
                {dashboard?.proofScore?.toFixed(1) ?? "0.0"}
              </div>
              <div className="text-[10px] text-[#777777]">Avg Proof Score</div>
            </div>
          </div>
          <div className="card-surface p-3">
            <div className="text-xs text-[#777777]">Next action:</div>
            <div className="text-sm text-[#3b82f6] mt-1">{dashboard?.nextAction}</div>
          </div>
        </div>
      </div>

      {/* Project List */}
      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">PROJECTS</h3>
        <div className="space-y-3">
          {(dashboard?.projects ?? []).map((project) => (
            <div key={project.id} className="p-3 bg-[#1a1a1a] rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#eaeaea]">{project.projectName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#3b82f6]/10 text-[#3b82f6] rounded">
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
                    <div className="text-[9px] text-[#777777]">{item.label}</div>
                    <div className="h-1 bg-white/[0.06] rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full bg-[#a855f7] rounded-full"
                        style={{ width: `${(item.value / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-2">
                {project.githubUpdated ? (
                  <CheckCircle2 size={12} className="text-[#22c55e]" />
                ) : (
                  <Circle size={12} className="text-[#444444]" />
                )}
                <Github size={12} className={project.githubUpdated ? "text-[#22c55e]" : "text-[#444444]"} />
                {project.linkedinUpdated ? (
                  <CheckCircle2 size={12} className="text-[#22c55e]" />
                ) : (
                  <Circle size={12} className="text-[#444444]" />
                )}
                <Linkedin size={12} className={project.linkedinUpdated ? "text-[#22c55e]" : "text-[#444444]"} />
                {project.resumeBulletAdded ? (
                  <CheckCircle2 size={12} className="text-[#22c55e]" />
                ) : (
                  <Circle size={12} className="text-[#444444]" />
                )}
                <FileText size={12} className={project.resumeBulletAdded ? "text-[#22c55e]" : "text-[#444444]"} />
              </div>
            </div>
          ))}
          {(!dashboard?.projects || dashboard.projects.length === 0) && (
            <div className="text-center py-8 text-sm text-[#444444]">
              No projects yet. Add your first artifact above.
            </div>
          )}
        </div>
      </div>

      <ChatGPTPrompt title="Career Analysis" promptText={promptText} />
    </div>
  );
}
