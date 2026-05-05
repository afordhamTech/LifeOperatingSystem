import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

export const relationshipsRouter = createRouter({
  listPeople: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.relationshipLogs)
      .where(eq(schema.relationshipLogs.userId, ctx.user.id))
      .orderBy(desc(schema.relationshipLogs.createdAt));

    const people = new Map();
    for (const row of rows) {
      if (!people.has(row.personName)) {
        people.set(row.personName, row);
      }
    }
    return Array.from(people.values());
  }),

  logInteraction: authedQuery
    .input(
      z.object({
        personName: z.string(),
        date: z.string(),
        lastContact: z.string().optional(),
        conversationQuality: z.number().min(1).max(10).optional(),
        unresolvedIssue: z.string().optional(),
        followUpNeeded: z.boolean().optional(),
        encouragementGiven: z.boolean().optional(),
        boundaryNeeded: z.boolean().optional(),
        miscommunication: z.string().optional(),
        socialConfidence: z.number().min(1).max(10).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const importance = 7;
      const daysSince = input.lastContact
        ? Math.ceil((new Date().getTime() - new Date(input.lastContact).getTime()) / (1000 * 60 * 60 * 24))
        : 7;
      const unresolvedTension = input.unresolvedIssue ? 7 : 2;
      const opportunity = input.followUpNeeded ? 8 : 4;
      const priority = Math.round((importance * 0.35 + Math.min(10, daysSince) * 0.25 + unresolvedTension * 0.25 + opportunity * 0.15) * 100) / 100;

      const data = { ...input, userId: ctx.user.id, relationshipPriority: priority };
      const result = await db.insert(schema.relationshipLogs).values(data);
      return { ...data, id: Number(result[0].insertId) };
    }),

  getFollowUps: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(schema.relationshipLogs)
      .where(
        and(
          eq(schema.relationshipLogs.userId, ctx.user.id),
          eq(schema.relationshipLogs.followUpNeeded, true)
        )
      )
      .orderBy(desc(schema.relationshipLogs.createdAt));
  }),
});
