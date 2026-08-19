import type { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth.js';

const prisma = new PrismaClient();

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/reports/summary', async (request) => {
    const { shopId } = await requireAuth(request);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [sales, orders, pendingOrders, products, credit] = await Promise.all([
      prisma.order.aggregate({ where: { shopId, createdAt: { gte: start }, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.count({ where: { shopId, createdAt: { gte: start } } }),
      prisma.order.count({ where: { shopId, status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'READY'] } } }),
      prisma.product.findMany({ where: { shopId, isActive: true }, select: { stockQuantity: true, minimumStock: true } }),
      prisma.ledgerEntry.groupBy({ by: ['direction'], where: { shopId }, _sum: { amount: true } }),
    ]);
    const creditTotals = credit.reduce((result, item) => { if (item.direction === 'DEBIT') result.debit = result.debit.plus(item._sum.amount ?? 0); else result.credit = result.credit.plus(item._sum.amount ?? 0); return result; }, { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
    const lowStock = products.filter((product) => product.stockQuantity.lte(product.minimumStock)).length;
    return { success: true, data: { todaySales: (sales._sum.total ?? 0).toString(), todayOrders: orders, pendingOrders, lowStock, outstandingCredit: creditTotals.debit.minus(creditTotals.credit).toFixed(2) }, error: null, meta: {} };
  });
}
