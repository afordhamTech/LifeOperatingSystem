import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

function calcSubstanceScore(log: Partial<schema.LearningLog>) {
  const reading = log.readingDone ? 0.25 : 0;
  const reflection = log.notesTaken ? 0.25 : 0;
  const writing = log.writingPractice ? 0.20 : 0;
  const speaking = log.speakingPractice ? 0.20 : 0;
  const newIdea = log.newConcept ? 0.10 : 0;
  return Math.round((reading + reflection + writing + speaking + newIdea) * 100) / 100;
}

export const learningRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.learningLogs)
        .where(and(eq(schema.learningLogs.userId, ctx.user.id), eq(schema.learningLogs.date, parseDateOnly(input.date))))
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
        .from(schema.learningLogs)
        .where(
          and(
            eq(schema.learningLogs.userId, ctx.user.id),
            gte(schema.learningLogs.date, start)
          )
        )
        .orderBy(schema.learningLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        readingDone: z.string().optional(),
        topicStudied: z.string().optional(),
        notesTaken: z.string().optional(),
        flashcardsMade: z.number().optional(),
        conversationPractice: z.boolean().optional(),
        newConcept: z.string().optional(),
        questionOfDay: z.string().optional(),
        writingPractice: z.boolean().optional(),
        speakingPractice: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const existing = await db
        .select()
        .from(schema.learningLogs)
        .where(and(eq(schema.learningLogs.userId, ctx.user.id), eq(schema.learningLogs.date, parseDateOnly(date))))
        .limit(1);

      const score = calcSubstanceScore(rest);
      const data = { ...rest, date: parseDateOnly(date), userId: ctx.user.id, substanceScore: score };

      if (existing.length > 0) {
        await db.update(schema.learningLogs).set(data).where(eq(schema.learningLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.learningLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getSubstanceScore: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const start = new Date();
    start.setDate(start.getDate() - 6);
      const rows = await db
        .select()
        .from(schema.learningLogs)
        .where(
          and(
            eq(schema.learningLogs.userId, ctx.user.id),
            gte(schema.learningLogs.date, start)
          )
        )
        .orderBy(schema.learningLogs.date);

    const avgScore = rows.length > 0 ? Math.round((rows.reduce((s, r) => s + Number(r.substanceScore || 0), 0) / rows.length) * 100) / 100 : 0;

    return {
      score: avgScore,
      factors: {
        reading: rows.filter((r) => r.readingDone).length,
        reflection: rows.filter((r) => r.notesTaken).length,
        writing: rows.filter((r) => r.writingPractice).length,
        speaking: rows.filter((r) => r.speakingPractice).length,
        newIdeas: rows.filter((r) => r.newConcept).length,
      },
      trend: rows.map((r) => ({ date: r.date, score: Number(r.substanceScore || 0) })),
    };
  }),
});
