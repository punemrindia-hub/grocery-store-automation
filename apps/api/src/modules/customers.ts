import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth.js';
import { AppError } from '../errors.js';

const prisma = new PrismaClient();
const customerInput = z.object({ name: z.string().trim().min(1).max(120), whatsappNumber: z.string().trim().min(8).max(20), email: z.string().email().optional() });

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/customers', async (request) => {
    const { shopId } = await requireAuth(request);
    const customers = await prisma.customer.findMany({ where: { shopId }, include: { _count: { select: { orders: true } } }, orderBy: { updatedAt: 'desc' } });
    return { success: true, data: customers, error: null, meta: {} };
  });

  app.post('/api/v1/customers', async (request, reply) => {
    const { shopId } = await requireAuth(request);
    const input = customerInput.parse(request.body);
    const customer = await prisma.customer.create({ data: { ...input, email: input.email ?? null, shopId } });
    return reply.status(201).send({ success: true, data: customer, error: null, meta: {} });
  });

  app.delete('/api/v1/customers/:id', async (request) => {
    const { shopId } = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const customer = await prisma.customer.findFirst({ where: { id, shopId }, include: { _count: { select: { orders: true, ledgerEntries: true, conversations: true } } } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    if (customer._count.orders > 0 || customer._count.ledgerEntries > 0 || customer._count.conversations > 0) {
      throw new AppError('CUSTOMER_HAS_HISTORY', 'Customers with orders, ledger entries, or conversations cannot be deleted', 409);
    }
    await prisma.customer.delete({ where: { id: customer.id } });
    return { success: true, data: { id: customer.id, deleted: true }, error: null, meta: {} };
  });
}
