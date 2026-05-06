import { trpc } from "@/providers/trpc";
import { getStatusColor } from "@/components/StatusRing";
import {
  Moon,
  GraduationCap,
  Dumbbell,
  Apple,
  Briefcase,
} from "lucide-react";

export default function ArchivePage() {
  const today = new Date().toISOString().split("T")[0];

  const { data: sleepLogs } = trpc.sleep.getWeek.useQuery({ endDate: today });
  const { data: tasks } = trpc.academics.list.useQuery({});
  const { data: workoutLogs } = trpc.workout.getWeek.useQuery({ endDate: today });
  const { data: nutritionLogs } = trpc.nutrition.getWeek.useQuery({ endDate: today });
  const { data: careerItems } = trpc.career.list.useQuery();

  const sections = [
    {
      title: "Sleep Logs",
      icon: Moon,
      count: sleepLogs?.length ?? 0,
      color: "#6b87ae",
      data: sleepLogs?.map((s) => ({
        label: s.date,
        value: `${Number(s.hoursSlept || 0).toFixed(1)}h`,
        score: Number(s.readinessScore || 0),
      })),
    },
    {
      title: "Academic Tasks",
      icon: GraduationCap,
      count: tasks?.length ?? 0,
      color: "#c39a4e",
      data: tasks?.slice(0, 7).map((t) => ({
        label: t.taskName.slice(0, 20),
        value: t.className,
        score: Number(t.priorityScore || 0),
      })),
    },
    {
      title: "Workouts",
      icon: Dumbbell,
      count: workoutLogs?.length ?? 0,
      color: "#6a9a74",
      data: workoutLogs?.map((w) => ({
        label: w.date,
        value: w.workoutType || "—",
        score: Number(w.readinessScore || 0),
      })),
    },
    {
      title: "Nutrition Logs",
      icon: Apple,
      count: nutritionLogs?.length ?? 0,
      color: "#d38a5d",
      data: nutritionLogs?.map((n) => ({
        label: n.date,
        value: `${n.caloriesEaten ?? 0} cal`,
        score: n.protein ? Math.min(10, (n.protein / 150) * 10) : 0,
      })),
    },
    {
      title: "Career Artifacts",
      icon: Briefcase,
      count: careerItems?.length ?? 0,
      color: "#9a7bbd",
      data: careerItems?.slice(0, 7).map((c) => ({
        label: c.projectName.slice(0, 20),
        value: c.artifactType || "—",
        score: Number(c.proofScore || 0),
      })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <h1 className="text-2xl font-semibold text-[#25313c]">Archive</h1>
        <p className="text-sm text-[#6f685f] mt-1">
          Historical data from all life modules. Browse and review past entries.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="card-surface p-4 text-center">
              <Icon size={18} style={{ color: section.color }} className="mx-auto mb-2" />
              <div className="text-xl font-bold text-[#25313c]">{section.count}</div>
              <div className="text-[10px] text-[#6f685f]">{section.title}</div>
            </div>
          );
        })}
      </div>

      {/* Section Details */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="card-surface p-4">
            <h3 className="text-sm font-semibold text-[#25313c] mb-3">{section.title}</h3>
            {section.data && section.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#6f685f] text-left border-b border-[#ddd4c6]">
                      <th className="pb-2 font-medium">Entry</th>
                      <th className="pb-2 font-medium">Details</th>
                      <th className="pb-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.data.map((row, i) => (
                      <tr key={i} className="border-b border-[#e3d8c9]">
                        <td className="py-2 text-[#25313c]">{String(row.label)}</td>
                        <td className="py-2 text-[#6f685f]">{String(row.value)}</td>
                        <td className="py-2">
                          <span
                            className="font-mono-data px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${getStatusColor(row.score)}15`,
                              color: getStatusColor(row.score),
                            }}
                          >
                            {row.score.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[#8c8478] py-4 text-center">
                No entries yet. Start logging sleep, tasks, workouts, nutrition, or career proof.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
