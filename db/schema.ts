import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  decimal,
  date,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  bodyweight: int("bodyweight"),
  targetBodyweight: int("target_bodyweight"),
  maintenanceCalories: int("maintenance_calories"),
  targetSleepHours: decimal("target_sleep_hours", { precision: 3, scale: 1, mode: "number" }).default(8),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Daily Logs (Daily Operating System) ───
export const dailyLogs = mysqlTable("daily_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  energy: int("energy"),
  mood: int("mood"),
  topGoal: text("top_goal"),
  mainObligation: text("main_obligation"),
  sleepReadiness: decimal("sleep_readiness", { precision: 4, scale: 2, mode: "number" }),
  workoutReadiness: decimal("workout_readiness", { precision: 4, scale: 2, mode: "number" }),
  academicPriorityScore: decimal("academic_priority_score", { precision: 4, scale: 2, mode: "number" }),
  nutritionStatus: varchar("nutrition_status", { length: 20 }),
  dailyPriorityScore: decimal("daily_priority_score", { precision: 4, scale: 2, mode: "number" }),
  mustDoTask: text("must_do_task"),
  shouldDoTasks: json("should_do_tasks"),
  maintenanceTasks: json("maintenance_tasks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_daily_logs_user_date").on(table.userId, table.date),
]);

export type DailyLog = typeof dailyLogs.$inferSelect;

// ─── Sleep Logs ───
export const sleepLogs = mysqlTable("sleep_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  dailyLogId: bigint("daily_log_id", { mode: "number", unsigned: true })
    .references(() => dailyLogs.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  bedtime: varchar("bedtime", { length: 10 }),
  wakeTime: varchar("wake_time", { length: 10 }),
  hoursSlept: decimal("hours_slept", { precision: 4, scale: 2, mode: "number" }),
  sleepQuality: int("sleep_quality"),
  energyOnWake: int("energy_on_wake"),
  stressLevel: int("stress_level"),
  caffeineAfter3pm: boolean("caffeine_after_3pm").default(false),
  screenBeforeBed: boolean("screen_before_bed").default(false),
  napDuration: int("nap_duration"),
  workoutIntensityYesterday: varchar("workout_intensity_yesterday", { length: 20 }),
  sleepDebt: decimal("sleep_debt", { precision: 5, scale: 2, mode: "number" }).default(0),
  readinessScore: decimal("readiness_score", { precision: 4, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_sleep_logs_user_date").on(table.userId, table.date),
]);

export type SleepLog = typeof sleepLogs.$inferSelect;

// ─── Academic Tasks ───
export const academicTasks = mysqlTable("academic_tasks", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  className: varchar("class_name", { length: 100 }).notNull(),
  taskName: varchar("task_name", { length: 255 }).notNull(),
  dueDate: date("due_date").notNull(),
  estimatedHours: decimal("estimated_hours", { precision: 4, scale: 1, mode: "number" }),
  difficulty: int("difficulty"),
  gradeImpact: int("grade_impact"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed"]).default("pending"),
  priorityScore: decimal("priority_score", { precision: 4, scale: 2, mode: "number" }),
  confidenceLevel: int("confidence_level"),
  hoursStudied: decimal("hours_studied", { precision: 4, scale: 1, mode: "number" }).default(0),
  officeHoursNeeded: boolean("office_hours_needed").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_academic_tasks_user_status").on(table.userId, table.status),
  index("idx_academic_tasks_due_date").on(table.dueDate),
]);

export type AcademicTask = typeof academicTasks.$inferSelect;

// ─── Workout Logs ───
export const workoutLogs = mysqlTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  dailyLogId: bigint("daily_log_id", { mode: "number", unsigned: true })
    .references(() => dailyLogs.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  workoutType: varchar("workout_type", { length: 50 }),
  exercises: json("exercises"),
  duration: int("duration"),
  bodyweight: int("bodyweight"),
  verticalJump: decimal("vertical_jump", { precision: 4, scale: 1, mode: "number" }),
  sorenessScore: int("soreness_score"),
  energy: int("energy"),
  painScore: int("pain_score"),
  readinessScore: decimal("readiness_score", { precision: 4, scale: 2, mode: "number" }),
  progressionNote: text("progression_note"),
  basketballSkillWork: int("basketball_skill_work"),
  boxingWork: int("boxing_work"),
  conditioning: int("conditioning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_workout_logs_user_date").on(table.userId, table.date),
]);

export type WorkoutLog = typeof workoutLogs.$inferSelect;

// ─── Nutrition Logs ───
export const nutritionLogs = mysqlTable("nutrition_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  dailyLogId: bigint("daily_log_id", { mode: "number", unsigned: true })
    .references(() => dailyLogs.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  bodyweight: int("bodyweight"),
  caloriesEaten: int("calories_eaten"),
  protein: int("protein"),
  carbs: int("carbs"),
  fat: int("fat"),
  waterGlasses: int("water_glasses"),
  mealsEaten: int("meals_eaten"),
  appetite: int("appetite"),
  trainingDay: boolean("training_day").default(false),
  energy: int("energy"),
  digestiveIssues: boolean("digestive_issues").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_nutrition_logs_user_date").on(table.userId, table.date),
]);

export type NutritionLog = typeof nutritionLogs.$inferSelect;

// ─── Health Logs ───
export const healthLogs = mysqlTable("health_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  painArea: varchar("pain_area", { length: 100 }),
  painScore: int("pain_score"),
  painType: varchar("pain_type", { length: 50 }),
  painTrigger: text("pain_trigger"),
  painReliever: text("pain_reliever"),
  trainingDone: text("training_done"),
  sleep: decimal("sleep", { precision: 4, scale: 2, mode: "number" }),
  hydration: int("hydration"),
  mobilityDone: boolean("mobility_done").default(false),
  medicationTaken: text("medication_taken"),
  doctorVisitNeeded: boolean("doctor_visit_needed").default(false),
  painTrend: varchar("pain_trend", { length: 20 }),
  injuryRiskScore: decimal("injury_risk_score", { precision: 4, scale: 2, mode: "number" }),
  redFlags: json("red_flags"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_health_logs_user_date").on(table.userId, table.date),
]);

export type HealthLog = typeof healthLogs.$inferSelect;

// ─── Career Artifacts ───
export const careerArtifacts = mysqlTable("career_artifacts", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  artifactType: varchar("artifact_type", { length: 50 }),
  artifactDescription: text("artifact_description"),
  hoursWorked: decimal("hours_worked", { precision: 4, scale: 1, mode: "number" }),
  proofScore: decimal("proof_score", { precision: 4, scale: 2, mode: "number" }),
  visibility: int("visibility"),
  difficulty: int("difficulty"),
  relevance: int("relevance"),
  completion: int("completion"),
  githubUpdated: boolean("github_updated").default(false),
  linkedinUpdated: boolean("linkedin_updated").default(false),
  resumeBulletAdded: boolean("resume_bullet_added").default(false),
  applicationSubmitted: boolean("application_submitted").default(false),
  mentorContact: varchar("mentor_contact", { length: 255 }),
  skillPracticed: varchar("skill_practiced", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type CareerArtifact = typeof careerArtifacts.$inferSelect;

// ─── Money Logs ───
export const moneyLogs = mysqlTable("money_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  income: decimal("income", { precision: 10, scale: 2, mode: "number" }),
  spending: decimal("spending", { precision: 10, scale: 2, mode: "number" }),
  savings: decimal("savings", { precision: 10, scale: 2, mode: "number" }),
  debt: decimal("debt", { precision: 10, scale: 2, mode: "number" }),
  foodSpending: decimal("food_spending", { precision: 10, scale: 2, mode: "number" }),
  schoolCosts: decimal("school_costs", { precision: 10, scale: 2, mode: "number" }),
  emergencyFund: decimal("emergency_fund", { precision: 10, scale: 2, mode: "number" }),
  netCashFlow: decimal("net_cash_flow", { precision: 10, scale: 2, mode: "number" }),
  savingsRate: decimal("savings_rate", { precision: 5, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_money_logs_user_date").on(table.userId, table.date),
]);

export type MoneyLog = typeof moneyLogs.$inferSelect;

// ─── Subscriptions ───
export const subscriptions = mysqlTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 2, mode: "number" }).notNull(),
  category: varchar("category", { length: 50 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;

// ─── Faith Logs ───
export const faithLogs = mysqlTable("faith_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  prayerDone: boolean("prayer_done").default(false),
  bibleReading: varchar("bible_reading", { length: 255 }),
  chapterStudied: varchar("chapter_studied", { length: 100 }),
  mainLesson: text("main_lesson"),
  question: text("question"),
  actionStep: text("action_step"),
  temptation: text("temptation"),
  gratitude: text("gratitude"),
  churchInvolvement: boolean("church_involvement").default(false),
  faithScore: decimal("faith_score", { precision: 5, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_faith_logs_user_date").on(table.userId, table.date),
]);

export type FaithLog = typeof faithLogs.$inferSelect;

// ─── Relationship Logs ───
export const relationshipLogs = mysqlTable("relationship_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  personName: varchar("person_name", { length: 100 }).notNull(),
  date: date("date").notNull(),
  lastContact: date("last_contact"),
  conversationQuality: int("conversation_quality"),
  unresolvedIssue: text("unresolved_issue"),
  followUpNeeded: boolean("follow_up_needed").default(false),
  encouragementGiven: boolean("encouragement_given").default(false),
  boundaryNeeded: boolean("boundary_needed").default(false),
  miscommunication: text("miscommunication"),
  socialConfidence: int("social_confidence"),
  relationshipPriority: decimal("relationship_priority", { precision: 4, scale: 2, mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RelationshipLog = typeof relationshipLogs.$inferSelect;

// ─── Learning Logs ───
export const learningLogs = mysqlTable("learning_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  date: date("date").notNull(),
  readingDone: varchar("reading_done", { length: 255 }),
  topicStudied: varchar("topic_studied", { length: 255 }),
  notesTaken: text("notes_taken"),
  flashcardsMade: int("flashcards_made").default(0),
  conversationPractice: boolean("conversation_practice").default(false),
  newConcept: text("new_concept"),
  questionOfDay: text("question_of_day"),
  writingPractice: boolean("writing_practice").default(false),
  speakingPractice: boolean("speaking_practice").default(false),
  substanceScore: decimal("substance_score", { precision: 4, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_learning_logs_user_date").on(table.userId, table.date),
]);

export type LearningLog = typeof learningLogs.$inferSelect;

// ─── Weekly Reviews ───
export const weeklyReviews = mysqlTable("weekly_reviews", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  weekStartDate: date("week_start_date").notNull(),
  weekEndDate: date("week_end_date").notNull(),
  academicScore: decimal("academic_score", { precision: 4, scale: 2, mode: "number" }),
  sleepScore: decimal("sleep_score", { precision: 4, scale: 2, mode: "number" }),
  trainingScore: decimal("training_score", { precision: 4, scale: 2, mode: "number" }),
  nutritionScore: decimal("nutrition_score", { precision: 4, scale: 2, mode: "number" }),
  careerScore: decimal("career_score", { precision: 4, scale: 2, mode: "number" }),
  faithScore: decimal("faith_score", { precision: 4, scale: 2, mode: "number" }),
  moneyScore: decimal("money_score", { precision: 4, scale: 2, mode: "number" }),
  relationshipScore: decimal("relationship_score", { precision: 4, scale: 2, mode: "number" }),
  weeklyLifeScore: decimal("weekly_life_score", { precision: 4, scale: 2, mode: "number" }),
  biggestWin: text("biggest_win"),
  biggestLeak: text("biggest_leak"),
  biggestMistake: text("biggest_mistake"),
  unfinishedTasks: json("unfinished_tasks"),
  nextWeekFocus: json("next_week_focus"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_weekly_reviews_user_week").on(table.userId, table.weekStartDate),
]);

export type WeeklyReview = typeof weeklyReviews.$inferSelect;
