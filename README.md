# Grocery Commerce Platform

Phase 1 foundation for a multi-shop grocery commerce, POS, billing, payments and ledger platform.

## Local setup

Requirements: Node.js 22+, npm 10+, Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install --ignore-scripts
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Dashboard: `http://localhost:5173`
API health: `http://localhost:3000/health`

Phase 2 API endpoints are documented in [API.md](API.md). Docker Desktop must be running before database migration commands can connect to the Compose PostgreSQL service.

Products and categories can be created from the dashboard after login. Orders can generate invoices and queue a local mock WhatsApp message without payment or Meta API keys. See [WHATSAPP.md](WHATSAPP.md) for the production Business Cloud setup.

The POS screen supports multiple items, live totals, customer phone capture, and Take away or Delivery fulfillment. The Reports screen reads current sales, pending orders, low stock, and ledger credit directly from the local database.

The development seed contains ABC Grocery, an owner account, Staples and one sample product. Login uses `owner@abc-grocery.local`, shop slug `abc-grocery`, and password `development-only-change-me`; replace this before any real deployment.

For a hosted MVP using Supabase PostgreSQL and Render, follow [DEPLOYMENT.md](DEPLOYMENT.md) and use the included `render.yaml` Blueprint.

## Commands

- `npm run typecheck` - strict TypeScript checks
- `npm run lint` - ESLint
- `npm test` - workspace tests
- `npm run db:migrate` - Prisma development migration
- `npm run db:seed` - development data

## Workspace layout

- `apps/api` - Fastify REST API, config validation, security plugins, health endpoints and error envelope
- `apps/dashboard` - Vite React operations dashboard shell
- `packages/database` - Prisma schema and development seed
- `packages/shared` - shared Zod contracts and domain enums

## Assumptions

Authentication and business modules are intentionally the next phase. All business records in the schema carry `shopId` or are reached through a shop-scoped parent. Financial values use Prisma Decimal types. Provider integrations will be added behind interfaces rather than coupled to route handlers.
