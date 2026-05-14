# Lifeee

Lifeee is a React, Vite, and TypeScript life operating system dashboard. It combines a Daily OS, task command center, calendar planning, weekly review, archive, and life-domain pages for sleep, academics, MCAT prep, workout, nutrition, health, career, money, faith, relationships, and substance tracking.

The app runs as a Vite SPA with a local Hono/tRPC API, Drizzle ORM schema files, and optional Supabase persistence/auth support.

## Prerequisites

- Node.js 20
- npm
- A local environment file when using auth, database, or Supabase-backed persistence

## Getting Started

Install dependencies:

```sh
npm install
```

Create a local environment file from the example:

```sh
cp .env.example .env.local
```

Use `.env` instead when running backend or Drizzle commands that load variables through `dotenv/config`. Both `.env` and `.env.local` are ignored by git.

Start the local dev server:

```sh
npm run dev
```

The Vite dev server is configured for port `3000`.

## Scripts

- `npm run dev` - start the local Vite app and Hono API dev server
- `npm run build` - build the frontend and bundle the production API server into `dist`
- `npm run start` - run the production server from `dist/boot.js`
- `npm run preview` - preview the built Vite frontend
- `npm run check` - run TypeScript project checks with `tsc -b`
- `npm run typecheck` - alias for `npm run check`
- `npm run lint` - run ESLint
- `npm run test` - run the Vitest suite
- `npm run format` - format the repo with Prettier
- `npm run db:generate` - generate Drizzle migrations
- `npm run db:migrate` - run Drizzle migrations
- `npm run db:push` - push Drizzle schema changes

## Environment

See `.env.example` for the full list of supported variables.

Common groups:

- Backend app secrets: `APP_ID`, `APP_SECRET`
- Database: `DATABASE_URL`
- Browser-exposed Vite variables: `VITE_KIMI_AUTH_URL`, `VITE_APP_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Backend Kimi auth/platform variables: `KIMI_AUTH_URL`, `KIMI_OPEN_URL`
- Owner/admin bootstrap: `OWNER_UNION_ID`

Do not commit real credentials or local env files.

## Project Layout

- `src/` - React app, pages, shared components, hooks, providers, and browser-side libraries
- `src/pages/` - main Lifeee route pages
- `src/components/` - app-specific components plus shadcn/ui primitives
- `api/` - Hono boot file, tRPC router, domain routers, middleware, and server helpers
- `contracts/` - shared constants, types, and errors
- `db/` - Drizzle schema, relations, migrations output, and seed stub
- `supabase/` - Supabase local config and migration history
- `docs/` - product and QA references, including the field map

## Main Routes

Command routes:

- `/` - Daily OS
- `/tasks` - Task Command
- `/calendar` - Calendar
- `/weekly-review` - Weekly Review
- `/archive` - Archive

Life-domain routes:

- `/sleep`
- `/academics`
- `/mcat`
- `/workout`
- `/nutrition`
- `/health`
- `/career`
- `/money`
- `/faith`
- `/relationships`
- `/substance`

Auth route:

- `/login`

## Testing Notes

The current Vitest config runs Node-based backend/library tests under `api/**/*.test.ts` and `api/**/*.spec.ts`.

Before changing behavior, run:

```sh
npm run check
npm run lint
npm run test
```

Frontend route or component tests may require expanding the Vitest config to use a browser-like environment such as jsdom or happy-dom.

## Documentation

- `docs/lifeoperatingsystem-field-map.md` inventories visible routes, fields, controls, status labels, prompts, and persistence targets.
- `info.md` captures initial setup notes, but it may lag behind the current source tree.
