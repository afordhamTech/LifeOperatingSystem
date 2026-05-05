import { authRouter } from "./auth-router";
import { sleepRouter } from "./sleep-router";
import { academicsRouter } from "./academics-router";
import { workoutRouter } from "./workout-router";
import { nutritionRouter } from "./nutrition-router";
import { careerRouter } from "./career-router";
import { healthRouter } from "./health-router";
import { moneyRouter } from "./money-router";
import { faithRouter } from "./faith-router";
import { relationshipsRouter } from "./relationships-router";
import { learningRouter } from "./learning-router";
import { dailyLogsRouter } from "./daily-logs-router";
import { weeklyReviewsRouter } from "./weekly-reviews-router";
import { userRouter } from "./user-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  sleep: sleepRouter,
  academics: academicsRouter,
  workout: workoutRouter,
  nutrition: nutritionRouter,
  career: careerRouter,
  health: healthRouter,
  money: moneyRouter,
  faith: faithRouter,
  relationships: relationshipsRouter,
  learning: learningRouter,
  dailyLogs: dailyLogsRouter,
  weeklyReview: weeklyReviewsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
