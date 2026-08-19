# Deployment

Local development uses Docker Compose for PostgreSQL and Redis. The MVP can be deployed with Supabase PostgreSQL, Render API, and Render static dashboard. `render.yaml` defines both services.

## Supabase + Render

1. Create a Supabase project and copy its PostgreSQL connection string from **Connect**. Use the direct/session connection for Prisma migrations. Keep the password URL-encoded.
2. Push this repository to GitHub.
3. In Render, choose **New > Blueprint**, connect the repository, and select `render.yaml`.
4. Set the API service `DATABASE_URL` to the Supabase connection string.
5. After Render creates the API URL, set the dashboard `VITE_API_URL` to that URL, for example `https://grocery-commerce-api.onrender.com`.
6. Set the API `CORS_ORIGIN` to the dashboard URL, for example `https://grocery-commerce-dashboard.onrender.com`.
7. Redeploy the dashboard after setting `VITE_API_URL` because Vite embeds it at build time.

The API build runs `prisma migrate deploy`, so the existing checked-in migrations create/update the Supabase schema. Do not run `prisma migrate dev` against production.

## Required production variables

`DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN` are required. `REDIS_URL` is optional for the current MVP because the queue integration is not active yet. WhatsApp and payment variables can remain empty while using the mock provider and no-payment invoice flow.

Required production controls include TLS, secret manager-backed environment values, migration review, health/readiness probes, structured log shipping, backups, alerting and restrictive network access to databases.
