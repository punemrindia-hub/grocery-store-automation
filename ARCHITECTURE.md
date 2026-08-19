# Architecture

The repository is an npm-workspaces monorepo. `apps/api` owns HTTP and application orchestration; `packages/database` owns Prisma persistence; `packages/shared` owns contracts shared by API and dashboard; `apps/dashboard` is a separate React client.

All tenant business data is scoped by `shopId`. Authenticated request context will resolve the shop and services will never accept an arbitrary shop identifier when it can be derived from session context.

Critical financial and inventory workflows will use Prisma transactions. External WhatsApp, payment and printer providers will be isolated behind provider interfaces and persisted webhook events will provide idempotency keys.

The API currently exposes stable response envelopes, request correlation through Fastify request IDs, structured Pino logging, security headers, CORS and rate limiting. `/health` is process health; `/ready` is reserved for dependency readiness checks.
