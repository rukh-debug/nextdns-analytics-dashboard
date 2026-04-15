@AGENTS.md

# NDNS Analytics Dashboard

## Tech Stack
- **Runtime**: Bun (NOT Node.js)
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL 16 via `postgres` (postgres.js) + Drizzle ORM
- **UI**: Tailwind CSS v4, shadcn/ui, Tremor charts, Framer Motion
- **State**: Zustand
- **Search**: Fuse.js
- **Language**: TypeScript (strict)

## Key Conventions
- Use `postgres` driver for all DB ops (async, via `drizzle-orm/postgres-js`)
- All DB calls are async — always `await` queries
- Drizzle ORM for queries — never raw SQL
- Server Components default, Client Components only when needed ("use client")
- API routes in `src/app/api/`
- All types in `src/types/`
- DB schema in `src/lib/db/schema.ts`

## Database
- PostgreSQL 16 running in Docker at `localhost:5433`
- Connection: `postgres://ndns:ndns_secret@localhost:5433/ndns_analytic`
- Docker compose: `/home/rukh/docker/postgres_ndns_analytic/docker-compose.yml`
- Migrations: `bun run db:generate` and `bun run db:migrate`
- Schema uses `pgTable`, `serial`, `timestamp`, `boolean`, `jsonb` from `drizzle-orm/pg-core`

## Commands
- `bun run dev` — dev server
- `bun run build` — prod build
- `bun run lint` — ESLint
- `bun run db:generate` — generate Drizzle migrations
- `bun run db:migrate` — run migrations
- `bun run db:seed` — seed default settings
