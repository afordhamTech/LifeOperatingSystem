import { z } from "zod";
import { eq, and, desc, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

function calcPriorityScore(
  gradeImpact: number,
  daysUntilDue: number,
  difficulty: number,
  estimatedHours: number
) {
  const urgency = Math.max(1, Math.min(10, 10 - daysUntilDue));
  const timeRequired = Math.min(10, estimatedHours);
  const priority =
    gradeImpact * 0.35 +
    urgency * 0.30 +
    difficulty * 0.20 +
    timeRequired * 0.15;
  return Math.round(priority * 100) / 100;
}

export const academicsRouter = createRouter({
  list: authedQuery
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(schema.academicTasks.userId, ctx.user.id)];
      if (input?.status) {
        conditions.push(eq(schema.academicTasks.status, input.status as "pending" | "in_progress" | "completed"));
      }
      const rows = await db
        .select()
        .from(schema.academicTasks)
        .where(and(...conditions))
        .orderBy(desc(schema.academicTasks.priorityScore));
      return rows;
    }),

  create: authedQuery
    .input(
      z.object({
        className: z.string(),
        taskName: z.string(),
        dueDate: z.string(),
        estimatedHours: z.number().optional(),
        difficulty: z.number().min(1).max(10).optional(),
        gradeImpact: z.number().min(1).max(10).optional(),
        confidenceLevel: z.number().min(1).max(10).optional(),
        officeHoursNeeded: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      const due = new Date(input.dueDate);
      const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const priorityScore = calcPriorityScore(
        input.gradeImpact ?? 5,
        daysUntilDue,
        input.difficulty ?? 5,
        input.estimatedHours ?? 1
      );

      const data = {
        ...input,
        userId: ctx.user.id,
        priorityScore,
      };

      const result = await db.insert(schema.academicTasks).values(data);
      return { ...data, id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        className: z.string().optional(),
        taskName: z.string().optional(),
        dueDate: z.string().optional(),
        estimatedHours: z.number().optional(),
        difficulty: z.number().min(1).max(10).optional(),
        gradeImpact: z.number().min(1).max(10).optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
        priorityScore: z.number().optional(),
        confidenceLevel: z.number().min(1).max(10).optional(),
        hoursStudied: z.number().optional(),
        officeHoursNeeded: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(schema.academicTasks)
        .set(data)
        .where(and(eq(schema.academicTasks.id, id), eq(schema.academicTasks.userId, ctx.user.id)));
      return { id, ...data };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(schema.academicTasks)
        .where(and(eq(schema.academicTasks.id, input.id), eq(schema.academicTasks.userId, ctx.user.id)));
      return { success: true };
    }),

  getPriority: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tasks = await db
      .select()
      .from(schema.academicTasks)
      .where(
        and(
          eq(schema.academicTasks.userId, ctx.user.id),
          eq(schema.academicTasks.status, "pending")
        )
      )
      .orderBy(desc(schema.academicTasks.priorityScore));

    const highestRisk = tasks.find(
      (t) => (t.gradeImpact ?? 0) >= 8 || (t.confidenceLevel ?? 10) <= 5
    );

    return {
      tasks,
      highestRisk: highestRisk?.className ?? null,
    };
  }),

  getStudyHours: authedQuery
    .input(z.object({ weekStart: z.string() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const start = input?.weekStart
        ? new Date(input.weekStart)
        : new Date();
      if (!input?.weekStart) {
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
      }
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      const rows = await db
        .select()
        .from(schema.academicTasks)
        .where(
          and(
            eq(schema.academicTasks.userId, ctx.user.id),
            gte(schema.academicTasks.dueDate, start.toISOString().split("T")[0])
          )
        );

      const total = rows.reduce((s, r) => s + Number(r.hoursStudied || 0), 0);
      return { total, target: 20, daily: [] };
    }),
});
