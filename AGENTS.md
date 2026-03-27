# Mars 2035 - Agent Guide

## Project Structure

Monorepo with npm workspaces:
- `shared/` — Shared types, constants, and utilities (must be built before server/client)
- `server/` — Game server (Node.js, TypeScript, PostgreSQL)
- `client/` — Web client (React, Vite, TypeScript)

## Environments

### Production
- **Location:** `/home/svenwitteveen/mars-2035`
- **Compose file:** `docker-compose.yml`
- **Client port:** 8080
- **Stack name:** `mars-2035`

### Development
- **Location:** `/home/svenwitteveen/mars-2035-dev`
- **Compose file:** `docker-compose.dev.yml`
- **Client port:** 8082
- **Stack name:** `mars-2035-dev`

Both stacks run independently with their own postgres volumes.

## Deployment

### Dev deployment (from mars-2035-dev)
```bash
# Build shared types first (needed for type-checking)
cd /home/svenwitteveen/mars-2035-dev/shared && npx tsc

# Rebuild and restart
docker compose -f docker-compose.dev.yml build server client
docker compose -f docker-compose.dev.yml up -d server client
```

### Prod deployment (from mars-2035)
```bash
cd /home/svenwitteveen/mars-2035
git pull origin main
docker compose -f docker-compose.yml up --build -d
```

### Verify
```bash
# Dev
docker compose -f docker-compose.dev.yml ps
# Prod
cd /home/svenwitteveen/mars-2035 && docker compose -f docker-compose.yml ps
```

### Services
- **postgres** — PostgreSQL 16 (alpine), healthcheck-gated
- **server** — Game server, depends on postgres healthy, connects via `DATABASE_URL`
- **client** — Nginx serving Vite-built static files, depends on server

## Build

The shared package must be compiled before server or client can type-check:
```bash
npm install                    # install all workspace deps
cd shared && npx tsc           # build shared types
npx tsc --noEmit -p server/tsconfig.json  # type-check server
npx tsc --noEmit -p client/tsconfig.json  # type-check client
```

Docker builds handle this automatically (`RUN npx tsc --build shared/tsconfig.json`).

## Branching

- `main` — primary branch
- `develop` — development/staging branch
