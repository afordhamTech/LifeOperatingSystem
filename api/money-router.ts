import { z } from "zod";
import { eq, and, desc, gte } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { parseDateOnly } from "./queries/date";
import { createRouter, authedQuery } from "./middleware";

export const moneyRouter = createRouter({
  getByDate: authedQuery
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.moneyLogs)
        .where(and(eq(schema.moneyLogs.userId, ctx.user.id), eq(schema.moneyLogs.date, parseDateOnly(input.date))))
        .limit(1);
      return rows.at(0) ?? null;
    }),

  getMonth: authedQuery
    .input(z.object({ month: z.string() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const month = input?.month ?? new Date().toISOString().slice(0, 7) + "-01";
      const start = parseDateOnly(month.slice(0, 7) + "-01");
      const rows = await db
        .select()
        .from(schema.moneyLogs)
        .where(
          and(
            eq(schema.moneyLogs.userId, ctx.user.id),
            gte(schema.moneyLogs.date, start)
          )
        )
        .orderBy(schema.moneyLogs.date);
      return rows;
    }),

  upsert: authedQuery
    .input(
      z.object({
        date: z.string(),
        income: z.number().optional(),
        spending: z.number().optional(),
        savings: z.number().optional(),
        debt: z.number().optional(),
        foodSpending: z.number().optional(),
        schoolCosts: z.number().optional(),
        emergencyFund: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { date, ...rest } = input;
      const income = input.income ?? 0;
      const spending = input.spending ?? 0;
      const savings = input.savings ?? 0;
      const netCashFlow = income - spending;
      const savingsRate = income > 0 ? Math.round((savings / income) * 10000) / 100 : 0;

      const existing = await db
        .select()
        .from(schema.moneyLogs)
        .where(and(eq(schema.moneyLogs.userId, ctx.user.id), eq(schema.moneyLogs.date, parseDateOnly(date))))
        .limit(1);

      const data = {
        ...rest,
        date: parseDateOnly(date),
        userId: ctx.user.id,
        netCashFlow,
        savingsRate,
      };

      if (existing.length > 0) {
        await db.update(schema.moneyLogs).set(data).where(eq(schema.moneyLogs.id, existing[0].id));
        return { ...existing[0], ...data };
      } else {
        const result = await db.insert(schema.moneyLogs).values(data);
        return { ...data, id: Number(result[0].insertId) };
      }
    }),

  getDashboard: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const start = new Date();
    start.setDate(1);
      const rows = await db
        .select()
        .from(schema.moneyLogs)
        .where(
          and(
            eq(schema.moneyLogs.userId, ctx.user.id),
            gte(schema.moneyLogs.date, start)
          )
        );

    const totalIncome = rows.reduce((s, r) => s + Number(r.income || 0), 0);
    const totalSpending = rows.reduce((s, r) => s + Number(r.spending || 0), 0);
    const totalSavings = rows.reduce((s, r) => s + Number(r.savings || 0), 0);
    const totalDebt = rows.reduce((s, r) => s + Number(r.debt || 0), 0);

    return {
      cashFlow: totalIncome - totalSpending,
      savingsRate: totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 10000) / 100 : 0,
      debtPressure: totalDebt,
      income: totalIncome,
      spending: totalSpending,
      savings: totalSavings,
    };
  }),

  listSubscriptions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, ctx.user.id))
      .orderBy(desc(schema.subscriptions.createdAt));
  }),

  addSubscription: authedQuery
    .input(
      z.object({
        name: z.string(),
        monthlyCost: z.number(),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const data = { ...input, userId: ctx.user.id };
      const result = await db.insert(schema.subscriptions).values(data);
      return { ...data, id: Number(result[0].insertId) };
    }),

  manageSubscription: authedQuery
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(schema.subscriptions)
        .set({ active: input.active })
        .where(and(eq(schema.subscriptions.id, input.id), eq(schema.subscriptions.userId, ctx.user.id)));
      return { success: true };
    }),
});
