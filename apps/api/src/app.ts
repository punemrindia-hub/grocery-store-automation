import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { healthResponseSchema } from '@grocery/shared';
import { AppError } from './errors.js';
import type { AppConfig } from './config.js';
import { registerCatalogRoutes } from './modules/catalog.js';
import { registerCustomerRoutes } from './modules/customers.js';
import { registerInventoryRoutes } from './modules/inventory.js';
import { registerOrderRoutes } from './modules/orders.js';
import { registerInvoiceRoutes } from './modules/invoices.js';
import { registerWhatsAppAgentRoutes } from './modules/whatsapp-agent.js';
import { registerLedgerRoutes } from './modules/ledger.js';
import { registerReportRoutes } from './modules/reports.js';

const prisma = new PrismaClient();

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' } });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (request.method === 'OPTIONS') {
      await reply.status(204).send();
    }
  });
  await app.register(helmet, { crossOriginResourcePolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await registerCatalogRoutes(app);
  await registerCustomerRoutes(app);
  await registerInventoryRoutes(app);
  await registerOrderRoutes(app);
  await registerInvoiceRoutes(app);
  await registerWhatsAppAgentRoutes(app);
  await registerLedgerRoutes(app);
  await registerReportRoutes(app);

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { shopSlug?: unknown; email?: unknown; password?: unknown };
    if (typeof body.shopSlug !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new AppError('INVALID_LOGIN', 'Shop, email and password are required', 400);
    }

    const user = await prisma.user.findFirst({ where: { email: body.email, shop: { slug: body.shopSlug }, isActive: true }, include: { shop: true } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid login credentials', 401);
    }

    const token = await reply.jwtSign({ sub: user.id, shopId: user.shopId, role: user.role });
    return reply.send({ success: true, data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, shop: { id: user.shop.id, name: user.shop.name, slug: user.shop.slug } } }, error: null, meta: {} });
  });

  app.get('/health', async () => {
    const response = { success: true as const, data: { status: 'ok', timestamp: new Date().toISOString() }, error: null, meta: {} };
    return healthResponseSchema.parse(response);
  });

  app.get('/ready', async (_request, reply) => reply.send({ success: true, data: { status: 'ready' }, error: null, meta: {} }));

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    request.log.error({ err: error, requestId }, 'request failed');
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, data: null, error: { code: error.code, message: error.message }, meta: { requestId, ...error.metadata } });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: config.NODE_ENV === 'production' ? 'An unexpected error occurred' : message }, meta: { requestId } });
  });

  return app;
}
