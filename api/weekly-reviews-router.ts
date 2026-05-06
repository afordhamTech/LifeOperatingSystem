import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { addDaysUtc, parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcWeeklyLifeScore(
  academics: number,
  sleep: number,
  training: number,
  nutrition: number,
  career: number,
  faith: number,
  money: number
) {
  return Math.round(
    (academics * 0.25 +
      sleep * 0.15 +
      training * 0.15 +
      nutrition * 0.10 +
      career * 0.15 +
      faith * 0.10 +
      money * 0.10) *
      100
  ) / 100;
}

export const weeklyReviewsRouter = createRouter({
  getByWeek: authedQuery
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const weekStart = parseDateOnly(input.weekStart);
      const rows = await db
        .select()
        .from(schema.weeklyReviews)
        .where(
          and(
            eq(schema.weeklyReviews.userId, ctx.user.id),
            eq(schema.weeklyReviews.weekStartDate, weekStart)
          )
        )
        .limit(1);
      return rows.at(0) ?? null;
    }),

  generate: authedQuery
    .input(z.object({ weekStart: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const start = parseDateOnly(input.weekStart);
      const end = addDaysUtc(start, 6);

      // Get sleep logs
      const sleepRows = await db
        .select()
        .from(schema.sleepLogs)
        .where(
          and(
            eq(schema.sleepLogs.userId, ctx.user.id),
            gte(schema.sleepLogs.date, start)
          )
        );
      const sleepAvg = sleepRows.length > 0
        ? Math.round((sleepRows.reduce((s, r) => s + Number(r.readinessScore || 0), 0) / sleepRows.length) * 100) / 100
        : 5;

      // Get academic tasks
      const taskRows = await db
        .select()
        .from(schema.academicTasks)
        .where(
          and(
            eq(schema.academicTasks.userId, ctx.user.id),
            gte(schema.academicTasks.dueDate, start)
          )
        );
      const completedTasks = taskRows.filter((t) => t.status === "completed").length;
      const academicScore = taskRows.length > 0 ? Math.round((completedTasks / taskRows.length) * 10 * 100) / 100 : 5;

      // Get workout logs
      const workoutRows = await db
        .select()
        .from(schema.workoutLogs)
        .where(
          and(
            eq(schema.workoutLogs.userId, ctx.user.id),
            gte(schema.workoutLogs.date, start)
          )
        );
      const trainingAvg = workoutRows.length > 0
        ? Math.round((workoutRows.reduce((s, r) => s + Number(r.readinessScore || 0), 0) / workoutRows.length) * 100) / 100
        : 5;

      // Get nutrition logs
      const nutritionRows = await db
        .select()
        .from(schema.nutritionLogs)
        .where(
          and(
            eq(schema.nutritionLogs.userId, ctx.user.id),
            gte(schema.nutritionLogs.date, start)
          )
        );
      const nutritionScore = nutritionRows.length > 0
        ? Math.round((nutritionRows.filter((r) => r.caloriesEaten && r.protein).length / nutritionRows.length) * 10 * 100) / 100
        : 5;

      // Get career artifacts
      const careerRows = await db
        .select()
        .from(schema.careerArtifacts)
        .where(eq(schema.careerArtifacts.userId, ctx.user.id));
      const careerScore = careerRows.length > 0
        ? Math.round((careerRows.reduce((s, r) => s + Number(r.proofScore || 0), 0) / careerRows.length) * 100) / 100
        : 5;

      // Get faith logs
      const faithRows = await db
        .select()
        .from(schema.faithLogs)
        .where(
          and(
            eq(schema.faithLogs.userId, ctx.user.id),
            gte(schema.faithLogs.date, start)
          )
        );
      const faithAvg = faithRows.length > 0
        ? Math.round((faithRows.reduce((s, r) => s + Number(r.faithScore || 0), 0) / faithRows.length) * 100) / 100
        : 50;

      // Get money logs
      const moneyRows = await db
        .select()
        .from(schema.moneyLogs)
        .where(
          and(
            eq(schema.moneyLogs.userId, ctx.user.id),
            gte(schema.moneyLogs.date, start)
          )
        );
      const moneyScore = moneyRows.length > 0
        ? Math.round((moneyRows.filter((r) => Number(r.netCashFlow || 0) >= 0).length / moneyRows.length) * 10 * 100) / 100
        : 5;

      const lifeScore = calcWeeklyLifeScore(academicScore, sleepAvg, trainingAvg, nutritionScore, careerScore, faithAvg / 10, moneyScore);

      const existing = await db
        .select()
        .from(schema.weeklyReviews)
        .where(
          and(
            eq(schema.weeklyReviews.userId, ctx.user.id),
            eq(schema.weeklyReviews.weekStartDate, start)
          )
        )
        .limit(1);

      const data = {
        userId: ctx.user.id,
        weekStartDate: start,
        weekEndDate: end,
        academicScore,
        sleepScore: sleepAvg,
        trainingScore: trainingAvg,
        nutritionScore,
        careerScore,
        faithScore: faithAvg / 10,
        moneyScore,
        weeklyLifeScore: lifeScore,
      };

      if (existing.length > 0) {
        await db.update(schema.weeklyReviews).set(data).where(eq(schema.weeklyReviews.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.weeklyReviews).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  save: authedQuery
    .input(
      z.object({
        weekStart: z.string(),
        biggestWin: z.string().optional(),
        biggestLeak: z.string().optional(),
        biggestMistake: z.string().optional(),
        unfinishedTasks: z.array(z.string()).optional(),
        nextWeekFocus: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(schema.weeklyReviews)
        .set({
          biggestWin: input.biggestWin,
          biggestLeak: input.biggestLeak,
          biggestMistake: input.biggestMistake,
          unfinishedTasks: input.unfinishedTasks,
          nextWeekFocus: input.nextWeekFocus,
        })
        .where(
          and(
            eq(schema.weeklyReviews.userId, ctx.user.id),
            eq(schema.weeklyReviews.weekStartDate, parseDateOnly(input.weekStart))
          )
        );
      return { success: true };
    }),

  getLifeScore: authedQuery
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.weeklyReviews)
        .where(
          and(
            eq(schema.weeklyReviews.userId, ctx.user.id),
            eq(schema.weeklyReviews.weekStartDate, parseDateOnly(input.weekStart))
          )
        )
        .limit(1);

      const review = rows.at(0);
      if (!review) return { score: 0, breakdown: null, trend: null };

      return {
        score: Number(review.weeklyLifeScore || 0),
        breakdown: {
          academics: Number(review.academicScore || 0),
          sleep: Number(review.sleepScore || 0),
          training: Number(review.trainingScore || 0),
          nutrition: Number(review.nutritionScore || 0),
          career: Number(review.careerScore || 0),
          faith: Number(review.faithScore || 0),
          money: Number(review.moneyScore || 0),
          relationships: Number(review.relationshipScore || 0),
        },
        trend: null,
      };
    }),
});
