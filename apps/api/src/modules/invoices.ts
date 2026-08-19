import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth.js';
import { AppError } from '../errors.js';
import { MockWhatsAppProvider } from './whatsapp.js';

const prisma = new PrismaClient();
const provider = new MockWhatsAppProvider();

function invoiceNumber(prefix: string): string { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }

export async function registerInvoiceRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/orders/:orderId/invoice', async (request, reply) => {
    const { shopId } = await requireAuth(request);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(request.params);
    const order = await prisma.order.findFirst({ where: { id: orderId, shopId }, include: { customer: true, items: true, invoice: true, shop: { include: { settings: true } } } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (order.invoice) return reply.send({ success: true, data: { invoice: order.invoice, message: { provider: 'existing', status: 'SENT' } }, error: null, meta: { idempotent: true } });

    const settings = order.shop.settings;
    const prefix = settings?.invoicePrefix ?? 'INV';
    const number = invoiceNumber(prefix);
    const sent = await provider.sendText({ to: order.customer.whatsappNumber, body: `Invoice ${number} from ${order.shop.name}. Total: INR ${order.total.toFixed(2)}.` });
    const result = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.invoice.create({ data: { shopId, orderId: order.id, invoiceNumber: number, amountPaid: 0, amountPending: order.total } });
      const message = await transaction.whatsAppMessage.create({ data: { shopId, customerId: order.customerId, orderId: order.id, direction: 'OUTBOUND', messageType: 'INVOICE', recipient: order.customer.whatsappNumber, body: `Invoice ${number} from ${order.shop.name}. Total: INR ${order.total.toFixed(2)}.`, provider: sent.provider, providerMessageId: sent.providerMessageId, status: 'SENT', sentAt: new Date() } });
      return { invoice, message };
    });
    return reply.status(201).send({ success: true, data: result, error: null, meta: { provider: sent.provider } });
  });

  app.get('/api/v1/invoices', async (request) => {
    const { shopId } = await requireAuth(request);
    const invoices = await prisma.invoice.findMany({ where: { shopId }, include: { order: { include: { customer: true, items: true } } }, orderBy: { createdAt: 'desc' } });
    return { success: true, data: invoices, error: null, meta: {} };
  });
}
