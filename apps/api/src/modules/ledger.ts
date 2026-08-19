import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { LedgerDirection, LedgerType, PaymentMethod, PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth.js';
import { AppError } from '../errors.js';

const prisma = new PrismaClient();
const paymentInput = z.object({ amount: z.number().positive(), method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH), orderId: z.string().min(1).optional(), description: z.string().trim().max(200).default('Customer payment') });

export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/customers/:customerId/ledger', async (request) => {
    const { shopId } = await requireAuth(request); const { customerId } = z.object({ customerId: z.string().min(1) }).parse(request.params);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const entries = await prisma.ledgerEntry.findMany({ where: { shopId, customerId }, orderBy: { createdAt: 'asc' } });
    const totals = entries.reduce((result, entry) => { if (entry.direction === LedgerDirection.DEBIT) result.debit = result.debit.plus(entry.amount); else result.credit = result.credit.plus(entry.amount); return result; }, { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
    return { success: true, data: { customer, openingBalance: '0.00', entries, totalDebit: totals.debit.toFixed(2), totalCredit: totals.credit.toFixed(2), closingBalance: totals.debit.minus(totals.credit).toFixed(2) }, error: null, meta: {} };
  });

  app.post('/api/v1/customers/:customerId/payments', async (request, reply) => {
    const { shopId, userId } = await requireAuth(request); const { customerId } = z.object({ customerId: z.string().min(1) }).parse(request.params); const input = paymentInput.parse(request.body);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const order = input.orderId ? await prisma.order.findFirst({ where: { id: input.orderId, shopId, customerId } }) : null;
    if (input.orderId && !order) throw new AppError('ORDER_NOT_FOUND', 'Order not found for this customer', 404);
    const amount = new Prisma.Decimal(input.amount);
    const result = await prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.create({ data: { shopId, customerId, orderId: input.orderId ?? null, amount, method: input.method, status: input.method === PaymentMethod.CASH ? PaymentStatus.CASH : PaymentStatus.PAID, provider: 'MANUAL' } });
      await transaction.paymentTransaction.create({ data: { paymentId: payment.id, type: 'MANUAL_RECEIPT', amount, rawPayload: { method: input.method, description: input.description } } });
      const entry = await transaction.ledgerEntry.create({ data: { shopId, customerId, paymentId: payment.id, orderId: input.orderId ?? null, type: LedgerType.PAYMENT, direction: LedgerDirection.CREDIT, amount, description: input.description, reference: payment.id, createdBy: userId } });
      if (order) {
        const invoice = await transaction.invoice.findUnique({ where: { orderId: order.id } });
        if (invoice) { const paid = new Prisma.Decimal(invoice.amountPaid).plus(amount); const pending = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(order.total).minus(paid)); await transaction.invoice.update({ where: { id: invoice.id }, data: { amountPaid: paid, amountPending: pending } }); }
      }
      return { payment, entry };
    });
    return reply.status(201).send({ success: true, data: result, error: null, meta: {} });
  });
}
