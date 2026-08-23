# SkyTalk — Support Chat Platform

SkyTalk is a real-time customer support chat application. Customers land in the app through an SSO link from the host website and are instantly connected to a support agent. Staff (agents & admins) get a full workspace: live chats, AI-assisted replies, voice/video calls, end-to-end encrypted internal chats, SLA tracking, ticket-based chat history, and an admin monitoring panel.

**Live app:** https://skytalk.site 

---

## Documentation

| Doc | Audience | What's inside |
|---|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Developers | Install & run locally, environment variables, database setup |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Developers | Monorepo layout, tech stack, API codegen flow, key design decisions |
| [docs/DEMO-GUIDE.md](docs/DEMO-GUIDE.md) | PMs / Demos | Feature tour, demo script, test logins & links |

---

## Quick start (developers)

```bash
# Prerequisites: Node.js 20+, pnpm 9+, PostgreSQL 15+
pnpm install

# Set environment variables (see docs/SETUP.md for the full list)
export DATABASE_URL=postgres://user:pass@localhost:5432/skytalk
export SESSION_SECRET=some-long-random-string
export EXTERNAL_API_MOCK=true

# Terminal 1 — API server (Express + Socket.IO)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Web app (React + Vite)
pnpm --filter @workspace/chat-app run dev
```

Full setup instructions (including database schema) are in [docs/SETUP.md](docs/SETUP.md).

## Repository layout

```
artifacts/
  chat-app/        React + Vite frontend (customer, agent & admin UI)
  api-server/      Express 5 backend — REST API + Socket.IO realtime
lib/
  api-spec/        OpenAPI spec (source of truth for the API)
  api-zod/         Generated Zod schemas & types (do not edit by hand)
  api-client-react/ Generated React Query hooks (do not edit by hand)
  db/              Drizzle ORM database schema
docs/              Documentation
```

## Feature highlights

- **Customer chat via SSO** — customers arrive from the host site with a token; no signup needed
- **AI-assisted support** — AI answers first, escalates to a human agent after 5 replies
- **Bilingual** — customers chat in their language; staff always see English translations
- **Voice & video calls** — WebRTC calls between customers and agents
- **End-to-end encryption** — staff direct & group chats use Signal-protocol E2EE; server stores ciphertext only
- **Tickets & history** — ended chats are archived under ticket numbers, searchable by staff and customers
- **SLA tracking** — response-time clocks, breach alerts via Telegram
- **Admin panel** — live chat monitoring, user management, reports, message templates

## License

Private / proprietary. All rights reserved.
