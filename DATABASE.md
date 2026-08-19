# Database

PostgreSQL is the system of record. Prisma models use `Decimal` for money and quantity values; JavaScript floating point values must not be persisted as monetary amounts.

Run `npm run db:generate` after dependency installation, then `npm run db:migrate` and `npm run db:seed` for local development. Production migrations should be applied with Prisma's deploy command from a reviewed migration artifact.

The schema includes shops, settings, users, customers, addresses, categories, products, inventory transactions, carts, cart items, orders, payments, invoices, conversations, ledger entries and audit logs. Provider event IDs and shop-scoped business numbers have unique constraints for idempotency and tenant isolation. Inventory adjustments update product stock and append an immutable movement row in one transaction. Order creation consumes an active cart and records SALE movements transactionally.

The local PostgreSQL 17 Windows service is configured for development with the `DATABASE_URL` credentials from `.env.example`. Phase 2 and Phase 3 migrations are applied; the seeded database contains one shop, user, category and product.
