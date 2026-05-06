import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcSleepReadiness(
  hoursSlept: number,
  sleepQuality: number,
  energyOnWake: number,
  stressLevel: number,
  targetSleep: number = 8
) {
  const actualSleepScore = Math.min(10, (hoursSlept / targetSleep) * 10);
  const lowStressScore = 10 - (stressLevel || 0);
  const readiness =
    actualSleepScore * 0.40 +
    sleepQuality * 0.25 +
    energyOnWake * 0.20 +
    lowStressScore * 0.15;
  return {
    score: Math.round(readiness * 100) / 100,
    breakdown: {
      actualSleepScore: Math.round(actualSleepScore * 100) / 100,
      sleepQuality,
      energyOnWake,
      lowStressScore,
    },
  };
}

function calcSleepDebt(hoursSlept: number, targetSleep: number = 8) {
  const debt = targetSleep - hoursSlept;
  return Math.round(debt * 100) / 100;
}

export const sleepRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            eq(schema.sleepLogs.date, parseDateOnly(input.date))
          )
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
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            gte(schema.sleepLogs.date, start)
          )
        )
        .orderBy(schema.sleepLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        bedtime: z.string().optional(),
        wakeTime: z.string().optional(),
        hoursSlept: z.number().optional(),
        sleepQuality: z.number().min(1).max(10).optional(),
        energyOnWake: z.number().min(1).max(10).optional(),
        stressLevel: z.number().min(1).max(10).optional(),
        caffeineAfter3pm: z.boolean().optional(),
        screenBeforeBed: z.boolean().optional(),
        napDuration: z.number().optional(),
        workoutIntensityYesterday: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const existing = await db
        .select()
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            eq(schema.sleepLogs.date, parseDateOnly(date))
          )
        )
        .limit(1);

      const hours = input.hoursSlept ?? 0;
      const quality = input.sleepQuality ?? 5;
      const energy = input.energyOnWake ?? 5;
      const stress = input.stressLevel ?? 5;

      const { score: readinessScore, breakdown } = calcSleepReadiness(
        hours,
        quality,
        energy,
        stress
      );
      const sleepDebt = calcSleepDebt(hours);

      const data = {
        ...rest,
        date: parseDateOnly(date),
        userId: ctx.user.id,
        readinessScore,
        sleepDebt,
      };

      if (existing.length > 0) {
        await db
          .update(schema.sleepLogs)
          .set(data)
          .where(eq(schema.sleepLogs.id, existing[0].id));
        return { ...existing[0], ...data, breakdown };
      } else {
        const result = await db.insert(schema.sleepLogs).values(data);
        return { ...data, id: Number(result[0].insertId), breakdown };
      }
    }),

  getDebt: authedQuery
    .input(z.object({ days: z.number().default(7) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const start = new Date();
      start.setDate(start.getDate() - input.days + 1);
      const rows = await db
        .select()
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            gte(schema.sleepLogs.date, start)
          )
        )
        .orderBy(schema.sleepLogs.date);

      const totalDebt = rows.reduce((sum, r) => sum + Number(r.sleepDebt || 0), 0);
      return {
        totalDebt: Math.round(totalDebt * 100) / 100,
        dailyDebts: rows.map((r) => ({ date: r.date, debt: Number(r.sleepDebt || 0) })),
      };
    }),

  getReadiness: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            eq(schema.sleepLogs.date, parseDateOnly(input.date))
          )
        )
        .limit(1);

      const log = rows.at(0);
      if (!log) return { score: 0, breakdown: null };

      const result = calcSleepReadiness(
        Number(log.hoursSlept || 0),
        log.sleepQuality ?? 5,
        log.energyOnWake ?? 5,
        log.stressLevel ?? 5
      );
      return result;
    }),
});
