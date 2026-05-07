# LifeOperatingSystem -> Site Field Map

Generated from the Lifeee React source on 2026-05-07.

This document inventories the visible website structure, route tabs, fields, controls, status indicators, prompts, and declared persistence targets. It is a product and QA reference for the LifeOperatingSystem app.

## LifeOperatingSystem -> Global Shell

### App Name

- Visible brand: `Lifeee`
- Main layout: left sidebar plus scrollable main content
- Date shown in sidebar: current date
- User/session area: signed-in user initials/name area, login/sign-out control
- Mobile/compact controls: sidebar menu toggle, collapse/expand control

### Command Tabs

- Daily OS -> `/`
- Task Command -> `/tasks`
- Calendar -> `/calendar`
- Weekly Review -> `/weekly-review`
- Archive -> `/archive`

### Life Domain Tabs

- Sleep -> `/sleep`
- Academics -> `/academics`
- MCAT -> `/mcat`
- Workout -> `/workout`
- Nutrition -> `/nutrition`
- Health -> `/health`
- Career -> `/career`
- Money -> `/money`
- Faith -> `/faith`
- Relationships -> `/relationships`
- Substance -> `/substance`

### Global Floating Control

- `AI Prompts` floating button
- Opens `AI Prompt Drawer`
- Drawer close button
- Source page label
- `SyncBadge` export-history status

### Global Sync Status Labels

- Loading Supabase
- Saving
- Saved to Supabase
- Sync failed
- Local draft only
- Waiting for login
- Placeholder only

### Shared UI Components

- `SyncBadge`
- `StatusRing`
- `EmptyState`
- `PrivacyChip`
- `DailyOpModeChip`
- `ChatGPTPrompt`

## LifeOperatingSystem -> Login -> `/login`

### Fields

- Email
- Password

### Controls

- Sign in / create account submit button
- Sign in mode button
- Sign up mode button
- Email me a magic link button
- Optional Sign in with Kimi button when Kimi OAuth env vars exist

### Messages

- Supabase missing env warning
- Auth error message
- Confirmation or magic-link message

### Persistence/Auth

- Uses Supabase Auth when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured.

## LifeOperatingSystem -> Global AI Prompt Drawer

### Prompt Buttons

- Daily Plan
- Task Triage
- Calendar Planning
- Sleep Recovery
- Academic Rescue
- MCAT Tutor
- Workout Adjustment
- Nutrition Fix
- Weekly Review
- Bible Study
- Relationship Message
- Career Proof
- Full Lifeee Context Export

### Behavior

- Copies generated prompt text to clipboard.
- Attempts to save export history only when Supabase is configured and a user is logged in.
- Shows sync failure if export history does not save.

### Supabase Table

- Writes: `ai_prompt_exports`
- Fields written:
  - `user_id`
  - `prompt_type`
  - `prompt_text`
  - `source_page`

## LifeOperatingSystem -> Daily OS -> `/`

### Header

- Title: Daily Operating System
- Daily Operating Mode chip
- Daily plan `SyncBadge`
- Daily plan error text if save fails

### Top Status Strip

- Sleep status ring
- Academics status ring
- Workout status ring
- Nutrition 4-dot check status
- Priority average
- Weekly score
- Current date and weekday

### Notices

- Dashboard loaded from Supabase
- Supabase session missing notice
- Supabase env vars missing notice
- Dashboard load error notice

### Cards

- Must Do
- Should Do
- Maintenance
- Today's Plan
- Today timeline
- Plan Reality
- Anti Drift
- MCAT readiness gating
- Sleep module summary
- Academics module summary
- Workout module summary
- Nutrition module summary
- Weekly Review summary
- Quick Notes
- Sleep Trend
- Daily Log panel

### Today's Plan Sections

- Anchors
- Must Do
- Should Do 1
- Should Do 2
- Maintenance
- Quick Win
- Ignore Today

### Today's Timeline

- Fixed anchors
- Deep work windows
- Workout window
- Maintenance window
- Shutdown target
- Category chip where applicable
- Slot detail text where applicable

### Controls

- Open Task Command link
- Copy Calendar Planning Prompt button
- Open Calendar link

### Daily Log Fields

- Must do -> `daily_logs.must_do`
- Should do 1 -> `daily_logs.should_do_1`
- Should do 2 -> `daily_logs.should_do_2`
- Maintenance -> `daily_logs.maintenance`
- Energy slider -> `daily_logs.energy`
- Mood slider -> `daily_logs.mood`
- Notes -> `daily_logs.notes`

### Daily Log Controls

- Save Daily Log
- Snapshot summary
- Migration TODO panel

### Supabase Tables

- Reads:
  - `daily_logs`
  - `sleep_logs`
  - `academic_tasks`
  - `workout_logs`
  - `nutrition_logs`
  - `weekly_reviews`
  - `universal_tasks`
  - `calendar_anchors`
- Writes:
  - `daily_logs`
  - `daily_plans`

### Daily Plan Fields

- Date -> `daily_plans.date`
- Operating mode -> `daily_plans.operating_mode`
- Must-do task id -> `daily_plans.must_do_task_id`
- Should-do 1 task id -> `daily_plans.should_do_1_task_id`
- Should-do 2 task id -> `daily_plans.should_do_2_task_id`
- Maintenance task id -> `daily_plans.maintenance_task_id`
- Quick-win task id -> `daily_plans.quick_win_task_id`
- Ignore-today list -> `daily_plans.ignore_today`
- Reality score -> `daily_plans.reality_score`
- Main bottleneck -> `daily_plans.main_bottleneck`
- Shutdown target -> `daily_plans.shutdown_target`

## LifeOperatingSystem -> Task Command -> `/tasks`

### Header

- Title: Task Command
- Description: One inbox for everything
- Sync status pill
- Current energy input
- Copy Task Triage Prompt button

### Current Energy

- Numeric input, 1 to 10
- Stored locally as `lifeee.daily.energy`
- Used to calculate task priority and day plan

### Plan Overview Panels

- Life Inbox
- Today's Anchors
- Top priority
- Quick wins
- Maintenance
- Waiting
- Ignore today

### Add Task Fields

- Title -> `universal_tasks.title`
- Task type -> `universal_tasks.task_type`
- Due date -> `universal_tasks.due_date`
- Fixed time -> encoded into `universal_tasks.due_date` time component
- Estimated minutes -> `universal_tasks.estimated_minutes`
- Recurring -> `universal_tasks.recurring`
- Energy required -> `universal_tasks.energy_required`
- Urgency -> `universal_tasks.urgency`
- Importance -> `universal_tasks.importance`
- Consequence if delayed -> `universal_tasks.consequence_if_delayed`
- Trust impact -> `universal_tasks.trust_impact`
- Time efficiency -> `universal_tasks.time_efficiency`

### Add Task Controls

- Add to Inbox

### Task Tabs

- Life Inbox
- Today
- This Week
- Recurring
- Waiting
- Completed

### Task Row Fields And Controls

- Complete button
- Title
- Task type
- Estimated minutes
- Computed priority
- Due date
- Fixed time
- Recurring marker
- Status select:
  - Inbox
  - Today
  - This Week
  - Waiting
  - Completed
- Daily role select:
  - Auto role
  - Anchor
  - Must Do
  - Should Do
  - Maintenance
  - Quick Win
  - Waiting
  - Ignore Today
- Delete button

### Supabase Table

- Writes/reads/deletes: `universal_tasks`

### Local Draft/Cache

- Local cache key from task system.
- Used while logged out or before Supabase loads.

## LifeOperatingSystem -> Calendar -> `/calendar`

### Header

- Title: Calendar
- Description: Fixed anchors + flexible tasks + energy limits + reality check
- Sync status pill
- Copy Calendar Planning Prompt
- Copy Weekly Calendar Review Prompt
- Open Task Command

### View Tabs

- Today
- Week
- Month
- Agenda

### Active Date Control

- Date picker

### Reality Summary Cards

- Plan reality
- Open time
- Largest block
- Best deep work
- Shutdown target
- Recommendations list

### Today View

- Today timeline
- Today anchors
- Conflict warning if anchors overlap
- Anchor row controls

### Today Timeline Blocks

- Anchors
- Deep work
- Workout
- Maintenance
- Shutdown

### Anchor Row Fields

- Category chip
- Title
- Start time
- End time
- Duration
- Privacy level
- Location
- People
- Link
- Prep checklist
- Follow up
- Notes

### Anchor Row Controls

- Delete anchor
- Privacy select:
  - Private
  - Mentor Shareable
  - Public Proof
- Category select:
  - Academic
  - Connex
  - Work
  - Family
  - Household
  - Health
  - Workout
  - Nutrition
  - Money
  - Faith
  - Relationship
  - Career
  - MCAT
  - Admin
  - Personal
  - Recovery
- Generate follow up task

### Generated Follow Up Task Fields

- Title from anchor follow-up or `Follow up: {anchor title}`
- Task type mapped from anchor category
- Due date from anchor date
- Estimated minutes: 20
- Energy required: 4
- Urgency based on date
- Importance: 6
- Consequence if delayed: 6
- Trust impact: 6
- Time efficiency: 7
- Status: Inbox
- Daily role: Should Do
- Linked anchor id -> `universal_tasks.linked_anchor_id`
- Notes includes safe anchor reference

### Agenda View

- Grouped by date
- Anchor category
- Time
- Title
- Delete button

### Week View

- Lightweight 7-day grid
- Shows anchors by day
- Marked as roadmap for drag-to-schedule

### Month View

- Placeholder month grid
- Shows up to two anchors per day and overflow count
- Uses date picker to focus a day

### Add Anchor Fields

- Title -> `calendar_anchors.title`
- Category -> `calendar_anchors.category`
- Date -> `calendar_anchors.date`
- Start -> `calendar_anchors.start_time`
- End -> `calendar_anchors.end_time`
- Location -> `calendar_anchors.location`
- Link -> `calendar_anchors.link`
- People -> `calendar_anchors.people_involved`
- Prep -> `calendar_anchors.preparation_needed`
- Follow up -> `calendar_anchors.follow_up_needed`
- Notes -> `calendar_anchors.notes`
- Privacy -> `calendar_anchors.privacy_layer`
- Recurring -> local draft only; not stored in `calendar_anchors`

### Add Anchor Controls

- Add anchor

### Recurring Life Loops

- Morning launch
- Night shutdown
- Weekly review
- Monthly reset
- Semester review
- MCAT retest loop
- Workout progression
- Project review

### Supabase Tables

- Writes/reads/deletes: `calendar_anchors`
- Writes generated follow-up tasks: `universal_tasks`
- Writes calculated plan: `daily_plans`
- Reads: `universal_tasks`

## LifeOperatingSystem -> Weekly Review -> `/weekly-review`

### Header

- Title: Weekly Review
- Week start date
- `SyncBadge`

### Controls

- Use Current Snapshot
- Save Weekly Review

### Score Display

- Weekly Life Score status ring
- Category mini scores:
  - Academics
  - Sleep
  - Training
  - Nutrition
  - Career
  - Faith
  - Money

### Charts

- Category Breakdown bar chart
- 8.0 reference line

### Text Fields

- Biggest Win -> `weekly_reviews.biggest_win`
- Biggest Leak -> `weekly_reviews.biggest_leak`
- Next Week Big 3 -> `weekly_reviews.next_week_big_3`
- Notes -> `weekly_reviews.notes`

### Score Sliders

- Academics -> `weekly_reviews.academics_score`
- Sleep -> `weekly_reviews.sleep_score`
- Training -> `weekly_reviews.training_score`
- Nutrition -> `weekly_reviews.nutrition_score`
- Career Proof -> `weekly_reviews.career_proof_score`
- Faith Substance -> `weekly_reviews.faith_substance_score`
- Money Admin -> `weekly_reviews.money_admin_score`

### Computed Field

- Weekly Life Score -> `weekly_reviews.weekly_life_score`

### Supabase Tables

- Reads:
  - `weekly_reviews`
  - `academic_tasks`
  - `sleep_logs`
  - `workout_logs`
  - `nutrition_logs`
- Writes: `weekly_reviews`

## LifeOperatingSystem -> Archive -> `/archive`

### Header

- Title: Archive
- Description: Historical data from all life modules
- `SyncBadge`

### Decision Log Section

- Label: Writes to decision_logs
- Input: Decision -> `decision_logs.decision`
- Textarea: Options considered, one per line -> `decision_logs.options_considered`
- Input: Reason chosen -> `decision_logs.reason_chosen`
- Date input: Review date -> `decision_logs.review_date`
- Textarea: Notes -> `decision_logs.notes`
- Button: Add Decision

### Decision Row

- Decision title
- Decision date -> `decision_logs.decision_date`
- Review date
- Reason chosen
- Notes
- Delete button

### Archive Stats

- Sleep Logs count
- Academic Tasks count
- Workouts count
- Nutrition Logs count
- Career Artifacts count

### Archive Sections

- Sleep Logs
- Academic Tasks
- Workouts
- Nutrition Logs
- Career Artifacts

### Archive Tables

- Entry
- Details
- Score

### Supabase Tables

- Reads:
  - `sleep_logs`
  - `academic_tasks`
  - `workout_logs`
  - `nutrition_logs`
  - `proof_items`
  - `decision_logs`
- Writes/deletes:
  - `decision_logs`

## LifeOperatingSystem -> Sleep -> `/sleep`

### Header

- Title: Sleep
- Description
- `SyncBadge`

### Readiness Card

- StatusRing for sleep readiness
- Sleep Duration weighted score
- Sleep Quality weighted score
- Wake Energy weighted score
- Low Stress weighted score
- Sleep debt
- Readiness score
- Readiness label

### Sleep Form Fields

- Bedtime -> `sleep_logs.bedtime`
- Wake Time -> `sleep_logs.wake_time`
- Sleep Quality slider -> `sleep_logs.sleep_quality`
- Wake Energy slider -> `sleep_logs.wake_energy`
- Stress Before Bed slider -> `sleep_logs.stress_before_bed`
- Caffeine after 3pm checkbox -> `sleep_logs.caffeine_after_3pm`
- Nap (min) -> `sleep_logs.nap_minutes`
- Notes -> `sleep_logs.notes`

### Computed Fields

- Hours duration -> `sleep_logs.hours_slept`
- Sleep debt -> `sleep_logs.sleep_debt`
- Sleep readiness -> `sleep_logs.sleep_readiness`

### Controls

- Calculate & Save

### Charts And Lists

- 7-Day Trend line chart
- 7-day debt summary
- Sleep Recovery Tasks
- History table

### History Columns

- Date
- Bedtime
- Wake
- Hours
- Quality
- Energy
- Stress
- Debt
- Readiness

### Supabase Table

- Writes/reads: `sleep_logs`

## LifeOperatingSystem -> Academics -> `/academics`

### Header

- Title: Academics
- Description
- `SyncBadge`

### Add Task Fields

- Task name -> `academic_tasks.task_name`
- Class -> `academic_tasks.class_name`
- Due date -> `academic_tasks.due_date`
- Estimated Hours -> `academic_tasks.estimated_hours`
- Difficulty slider -> `academic_tasks.difficulty`
- Grade Impact slider -> `academic_tasks.grade_impact`
- Status -> `academic_tasks.status`
- Notes -> `academic_tasks.notes`

### Computed Fields

- Priority score -> `academic_tasks.priority_score`

### Add Task Controls

- Add Task

### Task List

- Priority badge
- Status select:
  - Pending
  - In Progress
  - Done
- Task name
- Class chip
- Due label
- Estimated hours
- Notes saved/no notes label
- Delete button

### Side Panels

- Grade Risk Alert
- Priority Breakdown bar chart
- Draft Mode status text

### Supabase Table

- Writes/reads/deletes: `academic_tasks`

## LifeOperatingSystem -> MCAT -> `/mcat`

### Header

- Title: MCAT Foundation OS
- Description
- Stage badge
- Sync status pill

### Hero Stats

- Streak
- Today minutes vs daily goal
- Week accuracy
- CARS this week
- Flashcards due

### Tabs

- Today
- Practice
- Topics
- CARS
- Review

### Today Tab

- Active session card or idle start card
- Today's Move card
- Top study queue
- Today's Log
- Retest queue

### Active Session Fields And Controls

- Topic select
- Running/paused state
- Timer
- Pause
- Resume
- Log
- Cancel without logging

### Idle Session Fields And Controls

- Topic select
- Start

### Today's Move

- Move title
- Move detail
- Topic chip
- Start session

### Today's Log Rows

- MCAT session topic
- Minutes
- Accuracy
- Question count
- Delete session
- CARS entry
- Passage count
- Minutes
- Accuracy
- Delete CARS entry

### Retest Queue

- Topic
- Retest priority
- Last reviewed
- Retested button

### Practice Tab

- All sessions list
- Log session button
- Error log

### Practice -> Error Log Fields

- Topic select
- Error type select
- Error note textarea
- Add error button
- Resolve/unresolve error button
- Delete error button

### Topics Tab Filters

- Search topics or units
- Priority filter
- Status filter
- Sort select
- Expand all
- Collapse
- Clear filters

### Topics Tab Row Controls

- Unit collapsible
- Topic title
- Priority badge
- Status badge
- Status select
- Accuracy/question count
- Study decision score
- Topic detail dialog

### CARS Tab Fields

- Passages
- Minutes
- Attempted
- Correct
- CARS miss type buttons
- Log CARS passage

### CARS Tab Displays

- This week
- CARS risk
- All-time accuracy
- Passages per week chart
- CARS entries list
- Delete CARS entry

### Review Tab Displays

- Sessions
- Minutes
- Accuracy
- Topics studied
- Accuracy by week chart
- Daily minutes chart
- Mistakes chart
- Weekly summary

### Review Tab Prompt Controls

- Copy ChatGPT tutor prompt
- Copy weekly review prompt

### Log Session Dialog Fields

- Topic
- Minutes
- Attempted
- Correct
- Flashcards
- Confidence before
- Confidence after
- Mistake type toggles
- Notes

### Log Session Dialog Controls

- Cancel
- Log session

### Topic Detail Dialog

- Topic title
- Unit
- Priority badge
- Status badge
- Weakness
- Last reviewed
- Accuracy
- Questions
- Sessions
- Errors
- Start session
- Mark retested
- Status select
- Recent sessions
- Recent errors

### Persistence

- Supabase table: `mcat_foundation_states`
- Stores:
  - `state` JSON
  - `active_session` JSON
- Local storage also keeps the MCAT foundation state and active timer for immediate resume.

## LifeOperatingSystem -> Workout -> `/workout`

### Header

- Title: Workout
- Description
- `SyncBadge`

### Readiness Card

- Training readiness `StatusRing`
- Workout decision label
- Training readiness score
- Recovery factors:
  - Sleep Readiness
  - Energy
  - Soreness Recovery
  - Pain Safety

### Quick Sliders

- Energy -> `workout_logs.energy`
- Soreness -> `workout_logs.soreness`
- Pain -> `workout_logs.pain`
- Pain warning when pain is above 4

### Add Exercise Fields

- Exercise preset select
- Custom exercise name
- Sets
- Reps
- Weight (lbs)
- Exercise RPE

### Add Exercise Controls

- Add to Workout

### Today's Workout Fields

- Workout Type -> `workout_logs.workout_type`
- Duration (min) -> `workout_logs.duration_minutes`
- Session RPE -> `workout_logs.rpe`
- Exercises list -> `workout_logs.exercises`

### Exercise Row Fields

- Name
- Sets
- Reps
- Weight
- RPE
- Remove exercise button

### Notes

- Notes textarea -> `workout_logs.notes`

### Save Controls

- Save Workout

### History And Charts

- 7-Day Trend line chart
- History table

### History Columns

- Date
- Type
- Duration
- Energy
- Pain
- Readiness

### Computed Field

- Training readiness -> `workout_logs.training_readiness`

### Supabase Table

- Writes/reads: `workout_logs`

## LifeOperatingSystem -> Nutrition -> `/nutrition`

### Header

- Title: Nutrition
- Description
- `SyncBadge`

### Calorie Target Card

- Bodyweight (lbs) -> `nutrition_logs.bodyweight`
- Maintenance display
- Surplus slider
- Target calories display
- Calorie feedback

### Daily Input Fields

- Calories Eaten -> `nutrition_logs.calories`
- Protein (g) -> `nutrition_logs.protein_g`
- Carbs (g) -> `nutrition_logs.carbs_g`
- Fat (g) -> `nutrition_logs.fat_g`
- Water Glasses -> `nutrition_logs.water_oz`
- Meals Eaten -> `nutrition_logs.meals_count`
- Training day checkbox -> `nutrition_logs.training_day`
- Notes -> `nutrition_logs.notes`

### Daily Input Controls

- Water decrement
- Water increment
- Meals decrement
- Meals increment

### Nutrition Status Card

- Calories hit/miss
- Protein hit/miss
- Water hit/miss
- Meals hit/miss
- Checks count
- Status color label

### Save Controls

- Save Nutrition

### Charts And Snapshots

- Weight Trend chart
- Weight change summary
- Week Snapshot

### Supabase Table

- Writes/reads: `nutrition_logs`

## LifeOperatingSystem -> Health -> `/health`

### Header

- Title: Health & Injury
- Description
- Sync status pill
- Sync error text

### Pain Tracker Fields

- Pain Area -> `health_logs.pain_area`
- Pain Score slider -> `health_logs.pain_score`
- Pain Type select -> `health_logs.pain_type`
  - Sharp
  - Dull
  - Aching
  - Burning
- Trend select -> `health_logs.pain_trend`
  - Decreasing
  - Stable
  - Increasing
- Triggers -> `health_logs.pain_trigger`
- Relievers -> `health_logs.pain_reliever`
- Mobility done checkbox -> `health_logs.mobility_done`
- Doctor needed checkbox -> `health_logs.doctor_visit_needed`

### Controls

- Log & Assess

### Injury Risk Card

- Injury risk `StatusRing`
- Pain Score factor
- Pain Trend factor
- Training Load factor
- Recovery Deficit factor

### Recommendations Card

- Recommendation list
- Red flags list

### Prompt

- ChatGPTPrompt title: Health Assessment
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Stored Model Fields Not Currently Exposed As Visible Inputs

- Training done -> `health_logs.training_done`
- Sleep -> `health_logs.sleep`
- Hydration -> `health_logs.hydration`
- Medication taken -> `health_logs.medication_taken`

### Computed Fields

- Injury risk -> `health_logs.injury_risk`
- Red flags -> `health_logs.red_flags`
- Action recommendation -> `health_logs.action_recommendation`

### Supabase Table

- Writes/reads: `health_logs`

## LifeOperatingSystem -> Career -> `/career`

### Header

- Title: Career & Proof
- Description
- `SyncBadge`
- Sync error text

### Add/Edit Project Form

- Project name -> `proof_items.artifact_name` and `proof_items.project`
- Artifact type -> `proof_items.artifact_type`
  - Code
  - Design
  - Writing
  - Video
  - Other
- Hours worked -> `proof_items.hours_worked`
- Privacy -> `proof_items.privacy_layer`
  - Private
  - Mentor Shareable
  - Public Proof
- Visibility slider -> `proof_items.visibility`
- Difficulty slider -> `proof_items.difficulty`
- Relevance slider -> `proof_items.relevance`
- Completion slider -> `proof_items.completion`

### Form Controls

- Add Entry
- Save Changes
- Cancel edit

### Stats

- Projects
- Resume Bullets
- LinkedIn Updates
- Avg Proof Score
- Next action

### Projects List

- Project name
- Artifact type chip
- PrivacyChip
- Proof score
- Edit button
- Delete button
- Hours worked
- Visibility progress bar
- Difficulty progress bar
- Relevance progress bar
- Completion progress bar

### Project Flag Buttons

- GitHub -> `proof_items.github_updated`
- LinkedIn -> `proof_items.linkedin_updated`
- Resume -> `proof_items.resume_bullet_added`

### Stored Model Fields Not Currently Exposed As Visible Inputs

- Application submitted -> `proof_items.application_submitted`
- Mentor contact -> `proof_items.mentor_contact`
- Skill practiced -> `proof_items.skill_used`

### Prompt

- ChatGPTPrompt title: Career Analysis
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Computed Field

- Proof score -> `proof_items.proof_score`

### Supabase Table

- Writes/reads/deletes: `proof_items`

## LifeOperatingSystem -> Money -> `/money`

### Header

- Title: Money
- Description
- Sync status pill
- Sync error text

### Stats

- Income
- Spending
- Savings
- Net Flow
- Savings rate

### Log Transactions Fields

- Income -> `money_logs.income`
- Spending -> `money_logs.spending`
- Savings -> `money_logs.savings`
- Debt -> `money_logs.debt`

### Log Transactions Controls

- Save Log

### Subscriptions Fields

- Subscription name -> `money_logs.subscription_items[].name`
- Monthly cost -> `money_logs.subscription_items[].monthlyCost`

### Subscriptions Controls

- Add subscription button

### Stored Model Fields Not Currently Exposed As Visible Inputs

- Upcoming expenses -> `money_logs.upcoming_expenses`
- Biggest leak -> `money_logs.biggest_leak`
- Notes -> `money_logs.notes`

### Computed Fields

- Subscriptions total -> `money_logs.subscriptions`
- Net cash flow -> `money_logs.net_cash_flow`
- Savings rate -> `money_logs.savings_rate`

### Prompt

- ChatGPTPrompt title: Financial Plan
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Supabase Table

- Writes/reads: `money_logs`

## LifeOperatingSystem -> Faith -> `/faith`

### Header

- Title: Faith
- Description
- `SyncBadge`
- Sync error text

### Conflict Choice

- Shows when local draft and cloud faith log both exist.
- Use local
- Use cloud
- Cancel

### Daily Check-In Fields

- Prayer completed checkbox -> `faith_logs.prayer_done`
- Church/group involvement checkbox -> `faith_logs.church_involvement`
- Bible passage / reading -> `faith_logs.bible_reading` and `faith_logs.passage`
- Chapter studied -> `faith_logs.chapter_studied`
- Main lesson -> `faith_logs.main_lesson`
- Question I had -> `faith_logs.question`
- Temptation or struggle -> `faith_logs.temptation` and `faith_logs.struggle`
- Gratitude -> `faith_logs.gratitude`
- Action step -> `faith_logs.action_step`

### Controls

- Save & Score

### Score Cards

- Faith Score
- This Week streak grid
- Breakdown

### Breakdown Factors

- Prayer
- Bible Study
- Reflection
- Action Step

### Prompt

- ChatGPTPrompt title: Faith Reflection
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Computed Field

- Faith score -> `faith_logs.faith_score`

### Supabase Table

- Writes/reads: `faith_logs`

## LifeOperatingSystem -> Relationships -> `/relationships`

### Header

- Title: Relationships
- Description
- Sync status pill
- Sync error text

### People Card

- Person name
- Last contact
- Conversation quality
- Follow-up needed indicator

### Log Interaction Fields

- Person name -> `relationship_logs.person_name`
- Conversation Quality slider -> `relationship_logs.conversation_quality`
- Unresolved issue -> `relationship_logs.unresolved_issue` and `relationship_logs.unresolved_tension`
- Notes -> `relationship_logs.notes`
- Follow-up needed checkbox -> `relationship_logs.follow_up_needed`

### Controls

- Log Interaction

### Follow-Ups Needed Section

- Person name
- Unresolved issue
- Follow-up icon

### Prompt

- ChatGPTPrompt title: Relationship Advice
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Computed Field

- Relationship priority -> `relationship_logs.relationship_priority`

### Supabase Table

- Writes/reads: `relationship_logs`

## LifeOperatingSystem -> Substance -> `/substance`

### Header

- Title: Substance & Learning
- Description
- `SyncBadge`
- Sync error text

### Conflict Choice

- Shows when local draft and cloud learning log both exist.
- Use local
- Use cloud
- Cancel

### Learning Log Fields

- Reading done -> `substance_logs.reading`
- Topic studied -> `substance_logs.topic_studied` and `substance_logs.conversation_topic`
- Notes taken -> `substance_logs.notes_taken` and `substance_logs.notes`
- New concept learned -> `substance_logs.concept_learned`
- Question of the day -> `substance_logs.question_of_day` and `substance_logs.question`
- Writing checkbox -> `substance_logs.writing_practice` and `substance_logs.writing`
- Speaking checkbox -> `substance_logs.speaking_practice_done` and `substance_logs.speaking_practice`
- Conversation checkbox -> `substance_logs.conversation_practice`
- Flashcards made -> `substance_logs.flashcards_made`

### Controls

- Save & Score

### Score Cards

- Substance Score
- Factors
- Weekly Trend

### Factors

- Reading
- Reflection
- Writing
- Speaking
- New Ideas

### Prompt

- ChatGPTPrompt title: Deepen Understanding
- Buttons from `ChatGPTPrompt`: Copy Prompt, Open ChatGPT

### Computed Field

- Substance score -> `substance_logs.substance_score`

### Supabase Table

- Writes/reads: `substance_logs`

## LifeOperatingSystem -> Shared Prompt Component

Used by Health, Career, Money, Faith, Relationships, and Substance.

### Visible Elements

- Prompt title
- Prompt preview text area/block
- Copy Prompt button
- Open ChatGPT button

### Behavior

- Copies a module-specific prompt to clipboard.
- Opens ChatGPT in a new tab/window.

## LifeOperatingSystem -> Persistence Summary

### Supabase-First Real Tables

- `daily_logs`
- `daily_plans`
- `universal_tasks`
- `calendar_anchors`
- `sleep_logs`
- `academic_tasks`
- `mcat_foundation_states`
- `workout_logs`
- `nutrition_logs`
- `weekly_reviews`
- `decision_logs`
- `ai_prompt_exports`
- `proof_items`
- `faith_logs`
- `relationship_logs`
- `money_logs`
- `health_logs`
- `substance_logs`

### Local Draft/Cache Surfaces

- Logged-out draft mode for many forms
- First-render fallback while Supabase loads
- Offline/local cache for:
  - Task Command task state
  - Calendar anchors
  - MCAT state and active session
  - Daily energy value
  - Domain drafts in Health, Money, Faith, Relationships, Substance, and Career

### Explicit Placeholder Surfaces

- Calendar month view labels itself as a placeholder grid.
- Calendar week view labels drag-to-schedule as roadmap.
- Pages without login show waiting/local draft states instead of fake saved states.

## LifeOperatingSystem -> Route Map

| Route | Tab/Page | Primary tables |
| --- | --- | --- |
| `/login` | Login | Supabase Auth |
| `/` | Daily OS | `daily_logs`, `daily_plans`, plus module reads |
| `/tasks` | Task Command | `universal_tasks` |
| `/calendar` | Calendar | `calendar_anchors`, `universal_tasks`, `daily_plans` |
| `/weekly-review` | Weekly Review | `weekly_reviews` |
| `/archive` | Archive | `decision_logs`, read archive tables |
| `/sleep` | Sleep | `sleep_logs` |
| `/academics` | Academics | `academic_tasks` |
| `/mcat` | MCAT Foundation OS | `mcat_foundation_states` |
| `/workout` | Workout | `workout_logs` |
| `/nutrition` | Nutrition | `nutrition_logs` |
| `/health` | Health & Injury | `health_logs` |
| `/career` | Career & Proof | `proof_items` |
| `/money` | Money | `money_logs` |
| `/faith` | Faith | `faith_logs` |
| `/relationships` | Relationships | `relationship_logs` |
| `/substance` | Substance & Learning | `substance_logs` |
| `*` | Not Found | none |
