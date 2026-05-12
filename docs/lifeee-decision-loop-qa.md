# Lifeee Decision Loop QA Checklist

Covers commits 44cbfb1 (P0) through 5ce3e09 (Phase B10). Use this
checklist to drive one full week of real-life testing before any
further development.

## What to test

End-to-end weekly cycle, in order:

1. **Daily OS capture** — Open `/`. In the Today Decision Loop capture box,
   type a task and press Enter. Confirm the row appears in Inbox
   candidates and persists to Supabase `universal_tasks`. Repeat with
   each `task_type` quick chip.
2. **Today / Ignore Today / Done task actions** — On each inbox
   candidate, click `Today`, `This Week`, `Ignore Today`, and `Done`
   in turn. Confirm each click writes to `universal_tasks` (`status`
   and `daily_role` columns) and the row moves to the correct panel.
3. **Daily Plan save** — Edit the Anti-Drift note on Daily OS, blur
   the textarea, and confirm `daily_plans.notes` updates with debounced
   auto-save (SyncBadge: saving → saved). Verify the computed Day Plan
   (must do / should do / maintenance / quick win / ignore today
   roles) saves to `daily_plans`.
4. **Decision Log entry** — In the Decision Log card, write a
   one-line decision with reason, expected outcome, and a review_date.
   Click `Log decision`. Confirm a new `decision_logs` row appears
   and the card surfaces it in "Recent decisions".
5. **Decision Review when review_date arrives** — Set review_date to
   today or earlier. Confirm the row appears in "Decisions Due
   Review" panel. Enter a `result_later` and click `Mark reviewed`.
   Confirm the row updates and disappears from the due-review panel.
6. **Decision Outcome Lens** — Capture a task whose title exactly
   matches a previously reviewed decision. Confirm the inbox candidate
   row shows the lens tag with the matching outcome color.
7. **Decision Pattern Digest** — On `/weekly-review`, confirm the
   pattern digest card aggregates reviewed decisions: totals,
   recurring titles, current-week vs prior-week deltas, open overdue
   reviews. Confirm whitespace-only or unreviewed decisions are
   classified correctly.
8. **Weekly Bottleneck Diagnosis** — On `/weekly-review`, verify the
   diagnosis card reflects current tasks/decisions/anchors. Confirm
   the suggested fix updates when underlying counts change. Confirm
   `/` Daily OS shows the same diagnosis as a compact preview line
   (hidden when insufficient evidence).
9. **Next Week One Move** — On `/weekly-review`, the "Next Week One
   Move" card prefills with the suggestion if empty; type a custom
   move; click `Use suggestion` to overwrite; click `Save one move`.
   Confirm `weekly_reviews.next_week_big_3[0]` updates without
   clobbering slots 1/2 or other fields.
10. **Last Week One Move Verdict** — Next week, on `/weekly-review`,
    confirm the "LAST WEEK ONE MOVE VERDICT" card shows the previous
    move. Select an outcome, type a note, click `Save verdict`.
    Confirm the previous-week's `weekly_reviews.notes` now contains
    the `[oneMoveVerdict] outcome=...; note=...` sentinel and the
    previous week's other fields are intact.
11. **One Move Feedback History** — On `/weekly-review`, verify the
    feedback history card shows totals, verdict rate, outcome counts,
    current/longest streaks, and the top-5 most recent entries.
12. **Weekly Strategy Brief prompt copy** — On `/`, click `Copy
    weekly brief`. Confirm clipboard receives the full brief, that
    button shows `Copied + saved`, and that `ai_prompt_exports`
    receives one row with `prompt_type = "Weekly Strategy Brief"`,
    `source_page = "dashboard"`.
13. **AI Prompt Drawer export recording** — Open the drawer from any
    route. Click each prompt option (including the new `Weekly
    Strategy Brief`). Confirm each click records one
    `ai_prompt_exports` row with `prompt_type` matching the label
    and `source_page` matching the current route.

## Edge cases

- **Supabase env missing** — Clear env vars; reload. Confirm Daily OS,
  Task Command, Calendar, Weekly Review, and Prompt Drawer all render
  with `local` SyncBadge and no fake saved state.
- **User logged out** — With Supabase env present but no session.
  Confirm SyncBadge shows `waiting`; persistent writes are blocked;
  no toast claims success.
- **No prior weekly review row** — Confirm Dashboard hides the "This
  week's one move" line and "Last verdict" badge entirely. Confirm
  `/weekly-review` hides the `LAST WEEK ONE MOVE VERDICT` card.
- **Empty inbox** — Today Decision Loop shows the "Inbox is clear"
  hint. No fake candidates appear.
- **Empty decision log** — Decision Log card shows the empty-state
  copy. Pattern Digest empty-state appears on `/weekly-review`.
- **Malformed verdict sentinel** — Manually insert garbage like
  `[oneMoveVerdict] outcome=garbage; note=x` into a previous-week
  `weekly_reviews.notes`. Confirm Dashboard and Weekly Review treat
  it as no verdict and do not crash.
- **Future review_date** — Log a decision with `review_date >
  today`. Confirm it does NOT appear in "Decisions Due Review" and
  does NOT count in `openOverdueReviewCount`.
- **review_date equal to today** — Confirm it appears in "Due
  Review" and is NOT counted as overdue by the diagnosis or pattern
  helpers.
- **Whitespace-only fields** — Try saving a decision with whitespace
  `result_later`. Confirm helpers treat it as unreviewed.
- **Repeated clicks on save buttons** — Rapid-double-click `Save one
  move`, `Save verdict`, `Mark reviewed`, `Log decision`, and `Copy
  weekly brief`. Confirm each performs at most one Supabase write per
  intended action (saving-id guards / disabled buttons).
- **Clipboard failure** — In a non-secure context or with clipboard
  permission denied, click `Copy weekly brief`. Confirm visible
  error/retry state; no export row written.
- **`ai_prompt_exports` write failure** — Temporarily revoke RLS for
  the table (in a dev project). Confirm the brief is still copied to
  the clipboard, and the error message indicates the export did not
  save.
- **Cross-tab stale data** — Open `/` in two tabs. Mark a decision
  reviewed in tab A. Tab B does not reflect the change until reload
  — confirm no inconsistency that could cause writes against stale
  state.

## Persistence boundaries

| Surface | Reads | Writes |
| --- | --- | --- |
| Today Decision Loop (capture / quick actions) | `universal_tasks`, `calendar_anchors`, `decision_logs` | `universal_tasks` |
| Anti-Drift note | `daily_plans` | `daily_plans` (notes + auto-save fields) |
| Trust Protectors | `universal_tasks`, `calendar_anchors`, `decision_logs` | none |
| Decision Log card | `decision_logs` | `decision_logs` |
| Decisions Due Review panel | `decision_logs` | `decision_logs` (updates `result_later`) |
| Decision Outcome Lens | `decision_logs` | none |
| Weekly Bottleneck Diagnosis | `universal_tasks`, `calendar_anchors`, `decision_logs` | none |
| Decision Pattern Digest | `decision_logs` | none |
| Next Week One Move | `weekly_reviews` | `weekly_reviews.next_week_big_3[0]` (preserves slots 1/2 and all other fields) |
| Last Week One Move Verdict | previous-week `weekly_reviews` row | previous-week `weekly_reviews.notes` only, via `[oneMoveVerdict]` sentinel line |
| One Move Feedback History | recent `weekly_reviews` rows (batch) | none |
| Weekly Strategy Brief button | already-loaded Dashboard context | one row in `ai_prompt_exports` |
| AI Prompt Drawer | shared prompt context | one row in `ai_prompt_exports` per copy |
| Time Blocks | `time_blocks` (existing) | unchanged by B-arc; no decision-loop writes |

Sentinel notes:

- `[oneMoveVerdict] outcome=<worked|partial|missed|skipped>; note=<encodedURI>` lives **only** on the previous week's `weekly_reviews.notes`. The verdict UI writes it; everything else (Dashboard badge, feedback history, prompt context) reads it.
- The Daily OS surfaces above do NOT write to `decision_logs.notes`, `weekly_reviews.notes` of the current week, or any new table.

Read-only surfaces in the arc: Trust Protectors, Decision Outcome
Lens, Weekly Bottleneck Diagnosis, Decision Pattern Digest, One Move
Feedback History, Weekly Strategy Brief (the button only writes to
`ai_prompt_exports`; it does not mutate the underlying data).

## Known limitations carried into QA

- Recurrence detection across decisions and outcome-lens task
  matching is **exact-text only** after `normalizeDecisionText`
  (lower-case, trim, punctuation strip). No fuzzy or semantic
  matching.
- Sentiment classifier is **keyword-only** (English cue lists). "No
  regrets" classifies as negative.
- WeeklyReviewPage does NOT push prompt context. Opening the AI
  Prompt Drawer from `/weekly-review` uses a less-rich payload than
  from `/`.
- `today` is captured once per page mount via `useMemo(() =>
  toDateKey(new Date()), [])`. Sessions that cross midnight retain
  the pre-midnight `today` until reload.
- Dashboard and Weekly Review may show stale data until manual
  reload after another tab writes; there is no realtime subscription.
- No `reviewed_at` column. The arc uses `updated_at` (when
  `result_later` is non-empty) as the reviewed timestamp, with
  `created_at` as a last-resort fallback.
- No fuzzy matching.
- No AI ranking. All ranking is deterministic scoring with hard-coded
  weights (B6 diagnosis).
- No automatic task mutation. All decision-loop surfaces are
  read-only or write only to the table the user is directly editing.
- Weekly Strategy Brief depends on the currently loaded Dashboard
  context; mid-flight fetches can produce a brief with a "missing"
  marker that disappears after the fetch completes.

## B10 shippability pass criteria

Sign-off requires all of the following:

- All major routes load: `/`, `/tasks`, `/calendar`, `/weekly-review`,
  `/archive`, `/sleep`, `/academics`, `/mcat`, `/workout`,
  `/nutrition`, `/health`, `/career`, `/money`, `/faith`,
  `/relationships`, `/substance`.
- No fake saved states under any of the edge cases above.
- Supabase writes hit only the expected tables/columns from the
  Persistence boundaries table.
- `ai_prompt_exports` rows recorded for every prompt copy (drawer
  and Daily OS shortcut).
- Weekly Strategy Brief contains the full decision-loop context
  blocks plus the six required output sections.
- Empty-state copy is understandable on every surface (no blank
  cards, no dangling "—").
- Save errors are visible (inline error text or `error` SyncBadge),
  not silent.
- `README.md` remains unstaged across all commits.
- `npm run typecheck`, `npm test`, `npm run build` all pass.
- `npm run lint` reports no more than 42 problems.

## How to gather feedback during testing

Keep a written log per session in any tool you like (Apple Notes,
Notion, plain text). Use this template per entry:

```
Date:
Flow tested:
Expected behavior:
Actual behavior:
Confusion point (if any):
Bug severity (low / medium / high / blocker):
Screenshot or video link:
Fix idea:
Should this block shipping? (yes / no)
```

Aim for one entry per surface per week. Patterns matter more than
one-off bugs — if the same confusion shows up in three sessions
across two weeks, treat it as a real signal and prioritize that fix
before any new feature work.

Begin manual QA.
