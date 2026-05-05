import { z } from "zod";
import { eq, and, desc, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

function calcInjuryRisk(
  painScore: number,
  painTrend: string,
  trainingLoad: number = 5,
  recoveryDeficit: number = 3
) {
  const trendScore = painTrend === "increasing" ? 8 : painTrend === "stable" ? 5 : 2;
  const risk = painScore * 0.40 + trendScore * 0.25 + trainingLoad * 0.20 + recoveryDeficit * 0.15;
  return Math.round(risk * 100) / 100;
}

function calcRedFlags(painScore: number, painTrend: string, painType?: string) {
  const flags: string[] = [];
  if (painScore > 7) flags.push("Pain above 7 — no hard training");
  if (painTrend === "increasing") flags.push("Pain increasing — reduce load");
  if (painType === "sharp") flags.push("Sharp pain during movement — stop that movement");
  return flags;
}

export const healthRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.healthLogs)
        .where(and(eq(schema.healthLogs.userId, ctx.user.id), eq(schema.healthLogs.date, input.date)))
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
        .from(schema.healthLogs)
        .where(
          and(
            eq(schema.healthLogs.userId, ctx.user.id),
            gte(schema.healthLogs.date, start.toISOString().split("T")[0])
          )
        )
        .orderBy(schema.healthLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        painArea: z.string().optional(),
        painScore: z.number().min(1).max(10).optional(),
        painType: z.string().optional(),
        painTrigger: z.string().optional(),
        painReliever: z.string().optional(),
        trainingDone: z.string().optional(),
        sleep: z.number().optional(),
        hydration: z.number().min(1).max(10).optional(),
        mobilityDone: z.boolean().optional(),
        medicationTaken: z.string().optional(),
        doctorVisitNeeded: z.boolean().optional(),
        painTrend: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(schema.healthLogs)
        .where(and(eq(schema.healthLogs.userId, ctx.user.id), eq(schema.healthLogs.date, input.date)))
        .limit(1);

      const pain = input.painScore ?? 0;
      const trend = input.painTrend ?? "stable";
      const riskScore = calcInjuryRisk(pain, trend);
      const redFlags = calcRedFlags(pain, trend, input.painType ?? undefined);

      const data = { ...input, userId: ctx.user.id, injuryRiskScore: riskScore, redFlags };

      if (existing.length > 0) {
        await db.update(schema.healthLogs).set(data).where(eq(schema.healthLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.healthLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getRisk: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.healthLogs)
        .where(and(eq(schema.healthLogs.userId, ctx.user.id), eq(schema.healthLogs.date, input.date)))
        .limit(1);

      const log = rows.at(0);
      if (!log) return { score: 0, factors: null, redFlags: [], recommendations: [] };

      const pain = log.painScore ?? 0;
      const trend = log.painTrend ?? "stable";
      const risk = calcInjuryRisk(pain, trend);
      const flags = calcRedFlags(pain, trend, log.painType ?? undefined);

      const recommendations: string[] = [];
      if (pain > 7) recommendations.push("No hard training today");
      if (pain > 4) recommendations.push("Modify: reduce impact work");
      if (trend === "increasing") recommendations.push("Seek medical evaluation");
      if (!log.mobilityDone) recommendations.push("Do mobility work");

      return {
        score: risk,
        factors: { painScore: pain, painTrend: trend, trainingLoad: 5, recoveryDeficit: 3 },
        redFlags: flags,
        recommendations,
      };
    }),
});
