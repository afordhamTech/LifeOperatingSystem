import { z } from "zod";
import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

export const userRouter = createRouter({
  getProfile: authedQuery.query(async ({ ctx }) => {
    return ctx.user;
  }),

  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().optional(),
        bodyweight: z.number().optional(),
        targetBodyweight: z.number().optional(),
        maintenanceCalories: z.number().optional(),
        targetSleepHours: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(schema.users)
        .set(input)
        .where(eq(schema.users.id, ctx.user.id));
      return { ...ctx.user, ...input };
    }),

  getStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const today = new Date().toISOString().split("T")[0];

    const [sleepCount] = await db
      .select()
      .from(schema.sleepLogs)
      .where(eq(schema.sleepLogs.userId, ctx.user.id))
      .limit(100);
    const [taskCount] = await db
      .select()
      .from(schema.academicTasks)
      .where(eq(schema.academicTasks.userId, ctx.user.id))
      .limit(100);
    const [workoutCount] = await db
      .select()
      .from(schema.workoutLogs)
      .where(eq(schema.workoutLogs.userId, ctx.user.id))
      .limit(100);

    const logsThisWeek = [sleepCount, taskCount, workoutCount].filter(Boolean).length;

    return {
      modulesActive: logsThisWeek > 0 ? 3 : 0,
      logsThisWeek,
      currentStreak: logsThisWeek > 0 ? 1 : 0,
    };
  }),
});
