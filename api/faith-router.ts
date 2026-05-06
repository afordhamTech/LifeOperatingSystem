import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcFaithScore(log: Partial<schema.FaithLog>) {
  const prayer = log.prayerDone ? 0.30 : 0;
  const bible = log.bibleReading ? 0.30 : 0;
  const reflection = log.mainLesson ? 0.20 : 0;
  const action = log.actionStep ? 0.20 : 0;
  return Math.round((prayer + bible + reflection + action) * 100);
}

export const faithRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.faithLogs)
        .where(and(eq(schema.faithLogs.userId, ctx.user.id), eq(schema.faithLogs.date, parseDateOnly(input.date))))
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
        .from(schema.faithLogs)
        .where(
          and(
            eq(schema.faithLogs.userId, ctx.user.id),
            gte(schema.faithLogs.date, start)
          )
        )
        .orderBy(schema.faithLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        prayerDone: z.boolean().optional(),
        bibleReading: z.string().optional(),
        chapterStudied: z.string().optional(),
        mainLesson: z.string().optional(),
        question: z.string().optional(),
        actionStep: z.string().optional(),
        temptation: z.string().optional(),
        gratitude: z.string().optional(),
        churchInvolvement: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const existing = await db
        .select()
        .from(schema.faithLogs)
        .where(and(eq(schema.faithLogs.userId, ctx.user.id), eq(schema.faithLogs.date, parseDateOnly(date))))
        .limit(1);

      const score = calcFaithScore(rest);
      const data = { ...rest, date: parseDateOnly(date), userId: ctx.user.id, faithScore: score };

      if (existing.length > 0) {
        await db.update(schema.faithLogs).set(data).where(eq(schema.faithLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.faithLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getConsistency: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const start = new Date();
    start.setDate(start.getDate() - 6);
      const rows = await db
        .select()
        .from(schema.faithLogs)
        .where(
          and(
            eq(schema.faithLogs.userId, ctx.user.id),
            gte(schema.faithLogs.date, start)
          )
        )
        .orderBy(schema.faithLogs.date);

    const avgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + Number(r.faithScore || 0), 0) / rows.length) : 0;
    let streak = 0;
    const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const row of sorted) {
      if (Number(row.faithScore || 0) >= 50) streak++;
      else break;
    }

    return {
      weeklyScore: avgScore,
      streak,
      dailyScores: rows.map((r) => ({ date: r.date, score: Number(r.faithScore || 0) })),
    };
  }),
});
