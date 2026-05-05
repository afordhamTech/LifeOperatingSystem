import { z } from "zod";
import { eq, and, desc, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

export const dailyLogsRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.dailyLogs)
        .where(and(eq(schema.dailyLogs.userId, ctx.user.id), eq(schema.dailyLogs.date, input.date)))
        .limit(1);
      return rows.at(0) ?? null;
    }),

  getWeek: authedQuery
    .input(z.object({ startDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const start = new Date(input.startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const rows = await db
        .select()
        .from(schema.dailyLogs)
        .where(
          and(
            eq(schema.dailyLogs.userId, ctx.user.id),
            gte(schema.dailyLogs.date, start.toISOString().split("T")[0])
          )
        )
        .orderBy(schema.dailyLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        energy: z.number().min(1).max(10).optional(),
        mood: z.number().min(1).max(10).optional(),
        topGoal: z.string().optional(),
        mainObligation: z.string().optional(),
        sleepReadiness: z.number().optional(),
        workoutReadiness: z.number().optional(),
        academicPriorityScore: z.number().optional(),
        nutritionStatus: z.string().optional(),
        dailyPriorityScore: z.number().optional(),
        mustDoTask: z.string().optional(),
        shouldDoTasks: z.array(z.string()).optional(),
        maintenanceTasks: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(schema.dailyLogs)
        .where(and(eq(schema.dailyLogs.userId, ctx.user.id), eq(schema.dailyLogs.date, input.date)))
        .limit(1);

      const data: Record<string, unknown> = { ...input, userId: ctx.user.id };

      if (existing.length > 0) {
        await db.update(schema.dailyLogs).set(data).where(eq(schema.dailyLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.dailyLogs).values(data as schema.DailyLog);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  calculatePriority: authedQuery
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get sleep readiness
      const sleepRows = await db
        .select()
        .from(schema.sleepLogs)
        .where(and(eq(schema.sleepLogs.userId, ctx.user.id), eq(schema.sleepLogs.date, input.date)))
        .limit(1);
      const sleepReady = Number(sleepRows.at(0)?.readinessScore || 5);

      // Get top academic tasks
      const taskRows = await db
        .select()
        .from(schema.academicTasks)
        .where(
          and(
            eq(schema.academicTasks.userId, ctx.user.id),
            eq(schema.academicTasks.status, "pending")
          )
        )
        .orderBy(desc(schema.academicTasks.priorityScore))
        .limit(3);

      // Get workout readiness
      const workoutRows = await db
        .select()
        .from(schema.workoutLogs)
        .where(and(eq(schema.workoutLogs.userId, ctx.user.id), eq(schema.workoutLogs.date, input.date)))
        .limit(1);
      const workoutReady = Number(workoutRows.at(0)?.readinessScore || 5);

      const mustDo = taskRows.at(0)
        ? `${taskRows[0].taskName} (${taskRows[0].className})`
        : "Review daily goals";
      const shouldDo = taskRows
        .slice(1, 3)
        .map((t) => `${t.taskName} (${t.className})`);

      const maintenance = [
        "Drink 8 glasses of water",
        "Stretch for 10 minutes",
        "Review schedule for tomorrow",
      ];

      const dailyScore = Math.round(
        (sleepReady * 0.2 + workoutReady * 0.2 + (taskRows.at(0)?.priorityScore ? Number(taskRows[0].priorityScore) : 5) * 0.6) * 100
      ) / 100;

      return {
        mustDo,
        shouldDo,
        maintenance,
        score: dailyScore,
        sleepReady,
        workoutReady,
      };
    }),
});
