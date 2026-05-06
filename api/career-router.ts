import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

function calcProofScore(
  visibility: number,
  difficulty: number,
  relevance: number,
  completion: number
) {
  return Math.round((visibility * 0.25 + difficulty * 0.25 + relevance * 0.25 + completion * 0.25) * 100) / 100;
}

export const careerRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.careerArtifacts)
      .where(eq(schema.careerArtifacts.userId, ctx.user.id))
      .orderBy(desc(schema.careerArtifacts.createdAt));
    return rows;
  }),

  create: authedQuery
    .input(
      z.object({
        projectName: z.string(),
        artifactType: z.string().optional(),
        artifactDescription: z.string().optional(),
        hoursWorked: z.number().optional(),
        visibility: z.number().min(1).max(10).optional(),
        difficulty: z.number().min(1).max(10).optional(),
        relevance: z.number().min(1).max(10).optional(),
        completion: z.number().min(1).max(10).optional(),
        githubUpdated: z.boolean().optional(),
        linkedinUpdated: z.boolean().optional(),
        resumeBulletAdded: z.boolean().optional(),
        applicationSubmitted: z.boolean().optional(),
        mentorContact: z.string().optional(),
        skillPracticed: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const proofScore = calcProofScore(
        input.visibility ?? 5,
        input.difficulty ?? 5,
        input.relevance ?? 5,
        input.completion ?? 5
      );
      const data = { ...input, userId: ctx.user.id, proofScore };
      const result = await db.insert(schema.careerArtifacts).values(data);
      return { ...data, id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        projectName: z.string().optional(),
        artifactType: z.string().optional(),
        artifactDescription: z.string().optional(),
        hoursWorked: z.number().optional(),
        visibility: z.number().min(1).max(10).optional(),
        difficulty: z.number().min(1).max(10).optional(),
        relevance: z.number().min(1).max(10).optional(),
        completion: z.number().min(1).max(10).optional(),
        proofScore: z.number().optional(),
        githubUpdated: z.boolean().optional(),
        linkedinUpdated: z.boolean().optional(),
        resumeBulletAdded: z.boolean().optional(),
        applicationSubmitted: z.boolean().optional(),
        mentorContact: z.string().optional(),
        skillPracticed: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(schema.careerArtifacts)
        .set(data)
        .where(and(eq(schema.careerArtifacts.id, id), eq(schema.careerArtifacts.userId, ctx.user.id)));
      return { id, ...data };
    }),

  getDashboard: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.careerArtifacts)
      .where(eq(schema.careerArtifacts.userId, ctx.user.id))
      .orderBy(desc(schema.careerArtifacts.createdAt));

    const bulletsToUpdate = rows.filter((r) => !r.resumeBulletAdded).length;
    const linkedInUpdates = rows.filter((r) => !r.linkedinUpdated).length;
    const avgProofScore =
      rows.length > 0
        ? Math.round((rows.reduce((s, r) => s + Number(r.proofScore || 0), 0) / rows.length) * 100) / 100
        : 0;

    return {
      projects: rows,
      bulletsToUpdate,
      linkedInUpdates,
      proofScore: avgProofScore,
      nextAction: bulletsToUpdate > 0
        ? "Update resume with recent project bullets"
        : linkedInUpdates > 0
          ? "Post LinkedIn update about recent work"
          : "Start a new project to build proof",
    };
  }),
});
