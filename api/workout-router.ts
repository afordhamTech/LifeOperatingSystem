import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcTrainingReadiness(
  sleepReadiness: number,
  energy: number,
  soreness: number,
  pain: number,
  motivation: number = 7
) {
  const sorenessRecovery = 10 - soreness;
  const painSafety = 10 - pain;
  const readiness =
    sleepReadiness * 0.30 +
    energy * 0.20 +
    sorenessRecovery * 0.20 +
    painSafety * 0.20 +
    motivation * 0.10;
  return Math.round(readiness * 100) / 100;
}

function getWorkoutDecision(readiness: number, pain: number) {
  if (pain > 6) return { decision: "STOP", label: "Stop — Pain too high", color: "red" };
  if (readiness >= 8) return { decision: "FULL", label: "Full Workout — All systems go", color: "green" };
  if (readiness >= 6.5) return { decision: "NORMAL", label: "Normal — No ego lifting", color: "blue" };
  if (readiness >= 5) return { decision: "LIGHT", label: "Light Day — Technique focus", color: "yellow" };
  return { decision: "RECOVERY", label: "Recovery Day — Rest", color: "red" };
}

export const workoutRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(eq(schema.workoutLogs.userId, ctx.user.id), eq(schema.workoutLogs.date, parseDateOnly(input.date)))
        )
        .limit(1);
      return rows.at(0) ?? null;
    }),

  getWeek: authedQuery
    .input(z.object({ endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const end = new Date(input.endDate);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const rows = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(
            eq(schema.workoutLogs.userId, ctx.user.id),
            gte(schema.workoutLogs.date, start)
          )
        )
        .orderBy(schema.workoutLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        workoutType: z.string().optional(),
        exercises: z.array(z.any()).optional(),
        duration: z.number().optional(),
        bodyweight: z.number().optional(),
        verticalJump: z.number().optional(),
        sorenessScore: z.number().min(1).max(10).optional(),
        energy: z.number().min(1).max(10).optional(),
        painScore: z.number().min(1).max(10).optional(),
        basketballSkillWork: z.number().optional(),
        boxingWork: z.number().optional(),
        conditioning: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const existing = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(eq(schema.workoutLogs.userId, ctx.user.id), eq(schema.workoutLogs.date, parseDateOnly(date)))
        )
        .limit(1);

      const energy = input.energy ?? 5;
      const soreness = input.sorenessScore ?? 3;
      const pain = input.painScore ?? 1;

      const readinessScore = calcTrainingReadiness(6, energy, soreness, pain);
      const progressionNote = pain > 3
        ? `Reduce volume by 30-50%. Pain at ${pain}/10`
        : pain <= 3 && soreness <= 4
          ? "Ready to progress. Increase load next session."
          : "Maintain current load. Monitor recovery.";

      const data = {
        ...rest,
        date: parseDateOnly(date),
        userId: ctx.user.id,
        exercises: input.exercises ?? [],
        readinessScore,
        progressionNote,
      };

      if (existing.length > 0) {
        await db
          .update(schema.workoutLogs)
          .set(data)
          .where(eq(schema.workoutLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.workoutLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getReadiness: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(eq(schema.workoutLogs.userId, ctx.user.id), eq(schema.workoutLogs.date, parseDateOnly(input.date)))
        )
        .limit(1);

      const log = rows.at(0);
      if (!log) return { score: 0, decision: null, factors: null };

      const score = Number(log.readinessScore || 0);
      const pain = log.painScore ?? 0;
      const decision = getWorkoutDecision(score, pain);
      return {
        score,
        decision,
        factors: {
          sleepReadiness: 6,
          energy: log.energy ?? 5,
          sorenessRecovery: 10 - (log.sorenessScore ?? 3),
          painSafety: 10 - pain,
        },
      };
    }),

  getBodyweightTrend: authedQuery
    .input(z.object({ weeks: z.number().default(8) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const start = new Date();
      start.setDate(start.getDate() - input.weeks * 7);
      const rows = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(
            eq(schema.workoutLogs.userId, ctx.user.id),
            gte(schema.workoutLogs.date, start)
          )
        )
        .orderBy(schema.workoutLogs.date);

      return {
        data: rows
          .filter((r) => r.bodyweight)
          .map((r) => ({ date: r.date, weight: r.bodyweight })),
      };
    }),
});
