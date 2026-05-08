# 1v1 Chat

A full-featured 1v1 video chat app with WebRTC peer connections, Socket.IO matchmaking, a coins/gifts system, DMs, friends list, admin panel, and Stripe checkout. The UI is in Turkish.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/admin-panel run dev` — run the admin panel (port 20130)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `RESEND_API_KEY` — for email verification
- Optional env: `STRIPE_SECRET_KEY` — for coin purchases
- Optional env: `SESSION_SECRET` — for express-session

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind CSS, Socket.IO client
- API: Express 5 + Socket.IO server
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit OpenID Connect (cookie-based sessions via `openid-client`)
- Payments: Stripe
- Email: Resend
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/admin-panel/` — React admin panel (dashboard, reports, users, bans, matches, coins, roles, audit log)
- `artifacts/api-server/` — Express API + Socket.IO matchmaking server
- `lib/db/src/schema/` — Drizzle schema: auth, profiles, coins, dms, friends, bans, reports, gifts, email_verifications, matches, audit_logs
- `lib/replit-auth-web/` — `useAuth()` hook for Replit OIDC
- `artifacts/api-server/src/routes/` — REST routes: auth, profile, coins, bans, friends, dms, reports, presence, gifts, admin, email, matches, checkout
- `artifacts/api-server/src/lib/socketio.ts` — Socket.IO matchmaking engine

## Architecture decisions

- Socket.IO path `/socket.io` is listed in the API server's `artifact.toml` paths so the reverse proxy forwards WebSocket upgrades correctly.
- WebRTC signalling is brokered through Socket.IO.
- Sessions are managed server-side with cookie-based OIDC sessions; the `authMiddleware` validates tokens and attaches `req.user`.
- Rate limiting is implemented in-memory (300 req/min per IP) with automatic cleanup.
- Admin routes require the `userRolesTable` row with role="admin" for the requesting user.

## Product

Users can log in via Replit Auth, set up a profile, and instantly match with strangers for 1v1 video calls. They can send virtual gifts (coin-powered), DM friends, report/block users, and purchase coin packs via Stripe. Admins have a panel at `/admin/` to manage bans, reports, users, coins, and view analytics.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The `/socket.io` path must be in the API server artifact.toml `paths` array or the proxy drops WebSocket upgrades silently.
- After DB schema changes, always run `pnpm --filter @workspace/db run push` before restarting the API server.
- The API server needs `DATABASE_URL` set before it will start.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
