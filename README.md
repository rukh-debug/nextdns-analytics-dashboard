# NextDNS Analytics Dashboard

Self-hosted DNS monitoring for [NextDNS](https://nextdns.io) — real-time query ingestion, per-device analytics, Custom hosts list flagging, webhook alerts, and identity management.

## Get a NextDNS API Key

1. Sign up at [nextdns.io](https://nextdns.io) and create a profile
2. Go to [**Account**](https://my.nextdns.io/account) → scroll to **API** section
3. Copy your **API Key** (starts with a hex string)

## Docker (recommended)

You need a PostgreSQL database. This example uses the official image alongside the app:

```bash
git clone https://github.com/YOUR_REPO/nextdns-analytics-dashboard.git
cd nextdns-analytics-dashboard
cp .env.example .env
```

Edit `.env`:

```bash
NEXTDNS_API_KEY=your_api_key_here
ENCRYPTION_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgres://ndns:secret@db:5432/ndns_analytic
```

Create a `docker-compose.override.yml` to add Postgres:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ndns
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: ndns_analytic
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

Then:

```bash
docker compose up -d --build
```

Migrations run automatically on startup. Open [http://localhost:3000](http://localhost:3000), go to **Settings** → **Discover Profiles** to link your NextDNS account.

### Using the pre-built image

```bash
docker pull ghcr.io/rukh-debug/nextdns-analytics-dashboard:latest
```

## Local Development

**Requirements**: [Bun](https://bun.sh) >= 1.0, PostgreSQL 15+

```bash
git clone https://github.com/YOUR_REPO/nextdns-analytics-dashboard.git
cd nextdns-analytics-dashboard
bun install
cp .env.example .env
```

Edit `.env` — set `NEXTDNS_API_KEY`, `ENCRYPTION_KEY`, and `DATABASE_URL` pointing to your local Postgres:

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgres://ndns:secret@localhost:5432/ndns_analytic
```

```bash
bun run db:migrate
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Ingestion starts automatically — no separate worker needed.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXTDNS_API_KEY` | — | NextDNS API key (for profile discovery) |
| `ENCRYPTION_KEY` | — | 64-char hex key (`openssl rand -hex 32`) |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | Server port |
| `POLL_INTERVAL_SECONDS` | `30` | DNS log polling interval |
| `RETENTION_DAYS` | `90` | Log retention (0 = forever) |
| `ENABLE_HISTORY_FETCH` | `0` | Bootstrap 7-day history on first run (`1` to enable). **Warning:** makes long API calls for several minutes |
| `ENABLE_CATCHUP_ON_BOOT` | `0` | Fill gaps from last ingestion on startup (`1` to enable) |
| `VOLUME_SPIKE_THRESHOLD` | `200` | Queries per 5-min window to trigger alert |
| `LOG_LEVEL` | `info` | `trace` `debug` `info` `warn` `error` `fatal` |
| `LOG_MODE` | `pretty` | `pretty` (colored) or `json` (structured; auto in prod) |

## Tech Stack

Next.js 16 · PostgreSQL · Drizzle ORM · Bun · Tailwind CSS v4 · shadcn/ui · Tremor · TypeScript

## License

[MIT](LICENSE)
