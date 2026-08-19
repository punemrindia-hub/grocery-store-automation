# Security

Secrets are environment-only and `.env` is ignored. The API validates configuration at startup, uses Zod for contracts, Fastify security headers, CORS and rate limiting, and does not expose production stack traces.

Before production: replace the seed password, provision a strong JWT secret, configure restrictive CORS, add authentication and RBAC, verify provider signatures, enable TLS, run migrations from reviewed artifacts, and review `npm audit` output. The current install reported 8 advisories from transitive dependencies; they should be triaged before deployment.
