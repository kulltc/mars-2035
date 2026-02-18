# Mars 2035

A multiplayer Mars colonization strategy game. Monorepo with three workspaces: `shared` (types & constants), `server` (Fastify 5 + WebSocket), and `client` (React 18 + Vite 6).

## Prerequisites

- Node.js (v18+)
- PostgreSQL (for user accounts and game state snapshots)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:password@localhost:5432/postgres` | PostgreSQL connection string |
| `PORT` | `3000` | Server listen port |
| `JWT_SECRET` | `mars-2035-dev-secret` | Secret for JWT auth tokens — **change in production** |
| `SNAPSHOT_INTERVAL_TICKS` | `1` | Save a game snapshot every N ticks (each tick is 5 seconds) |

## Development

Run the server and client in separate terminals:

```bash
npm run dev -w server    # Fastify on :3000 (tsx watch, auto-restarts)
npm run dev -w client    # Vite on :5173 (proxies /api and /ws to server)
```

The Vite dev server proxies `/api` and `/ws` requests to `http://localhost:3000`.

## Production Deployment

### Build

```bash
npx tsc --build shared/tsconfig.json   # compile shared types
npm run build -w client                 # produces client/dist/
```

### Run

```bash
npm run start -w server                 # runs tsx src/index.ts
```

Serve `client/dist/` with a static file server (nginx, Caddy, etc.) and proxy `/api` and `/ws` to the server port.

### Database

Tables are created automatically on startup (`CREATE TABLE IF NOT EXISTS`):
- `users` — player accounts (username, hashed password, player ID)
- `world_snapshots` — serialized game state snapshots

No manual migrations needed.

## Starting, Stopping, Restarting

- **Start**: `npm run start -w server`
- **Stop**: `Ctrl+C` or `kill <pid>` — the server handles SIGINT/SIGTERM for graceful shutdown
- **Restart**: Just start again. Game state automatically restores from the latest snapshot in Postgres.

## Game State Persistence

Game state is saved to the `world_snapshots` table as JSONB. Key details:

- A snapshot is saved every tick by default (every 5 seconds). Adjust with `SNAPSHOT_INTERVAL_TICKS`.
- The last 5 snapshots are retained per world; older ones are pruned automatically.
- On startup, the latest snapshot is loaded and the game resumes from that point (tick counter, players, buildings, market state, workers, task queue).
- The tile/world map is regenerated deterministically from a fixed seed — it is not stored in snapshots.
- User accounts persist separately in the `users` table and are unaffected by game state.
- The world ID is `mars-alpha` (hardcoded).
