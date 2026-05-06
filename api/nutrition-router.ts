import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcNutritionStatus(
  caloriesEaten: number,
  protein: number,
  waterGlasses: number,
  mealsEaten: number,
  bodyweight: number = 150,
  targetCalories: number = 2500
) {
  const caloriesHit = caloriesEaten >= targetCalories * 0.9 && caloriesEaten <= targetCalories * 1.1;
  const proteinHit = protein >= bodyweight * 0.8;
  const waterHit = waterGlasses >= 6;
  const timingOk = mealsEaten >= 3;

  let checks = 0;
  if (caloriesHit) checks++;
  if (proteinHit) checks++;
  if (waterHit) checks++;
  if (timingOk) checks++;

  let status: string;
  if (checks === 4) status = "green";
  else if (checks >= 2) status = "yellow";
  else status = "red";

  return { caloriesHit, proteinHit, waterHit, timingOk, status, checks };
}

export const nutritionRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.nutritionLogs)
        .where(and(eq(schema.nutritionLogs.userId, ctx.user.id), eq(schema.nutritionLogs.date, parseDateOnly(input.date))))
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
        .from(schema.nutritionLogs)
        .where(
          and(
            eq(schema.nutritionLogs.userId, ctx.user.id),
            gte(schema.nutritionLogs.date, start)
          )
        )
        .orderBy(schema.nutritionLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        bodyweight: z.number().optional(),
        caloriesEaten: z.number().optional(),
        protein: z.number().optional(),
        carbs: z.number().optional(),
        fat: z.number().optional(),
        waterGlasses: z.number().optional(),
        mealsEaten: z.number().optional(),
        appetite: z.number().min(1).max(10).optional(),
        trainingDay: z.boolean().optional(),
        energy: z.number().min(1).max(10).optional(),
        digestiveIssues: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const existing = await db
        .select()
        .from(schema.nutritionLogs)
        .where(and(eq(schema.nutritionLogs.userId, ctx.user.id), eq(schema.nutritionLogs.date, parseDateOnly(date))))
        .limit(1);

      const data = { ...rest, date: parseDateOnly(date), userId: ctx.user.id };

      if (existing.length > 0) {
        await db
          .update(schema.nutritionLogs)
          .set(data)
          .where(eq(schema.nutritionLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.nutritionLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getStatus: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.nutritionLogs)
        .where(and(eq(schema.nutritionLogs.userId, ctx.user.id), eq(schema.nutritionLogs.date, parseDateOnly(input.date))))
        .limit(1);

      const log = rows.at(0);
      if (!log) return { caloriesHit: false, proteinHit: false, waterHit: false, timingOk: false, status: "red", checks: 0 };

      return calcNutritionStatus(
        log.caloriesEaten ?? 0,
        log.protein ?? 0,
        log.waterGlasses ?? 0,
        log.mealsEaten ?? 0,
        log.bodyweight ?? 150
      );
    }),

  getWeightTrend: authedQuery
    .input(z.object({ weeks: z.number().default(4) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const start = new Date();
      start.setDate(start.getDate() - input.weeks * 7);
      const rows = await db
        .select()
        .from(schema.nutritionLogs)
        .where(
          and(
            eq(schema.nutritionLogs.userId, ctx.user.id),
            gte(schema.nutritionLogs.date, start)
          )
        )
        .orderBy(schema.nutritionLogs.date);

      const validRows = rows.filter((r) => r.bodyweight);
      const weeklyChange =
        validRows.length >= 2
          ? Math.round((Number(validRows[validRows.length - 1].bodyweight) - Number(validRows[0].bodyweight)) * 100) / 100
          : 0;

      return {
        daily: validRows.map((r) => ({ date: r.date, weight: r.bodyweight })),
        weeklyChange,
      };
    }),
});
