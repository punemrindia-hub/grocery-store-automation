import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { PrismaClient, InventoryTransactionType } from '@prisma/client';
import { AppError } from '../errors.js';
import { requireAuth } from '../auth.js';

const prisma = new PrismaClient();
const adjustmentInput = z.object({ type: z.nativeEnum(InventoryTransactionType), quantity: z.number().positive(), unitCost: z.number().nonnegative().optional(), reference: z.string().trim().max(120).optional() });

export async function registerInventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/inventory/low-stock', async (request) => {
    const { shopId } = await requireAuth(request);
    const products = await prisma.product.findMany({ where: { shopId, isActive: true }, orderBy: { stockQuantity: 'asc' } });
    return { success: true, data: products.filter((product) => product.stockQuantity.lte(product.minimumStock)), error: null, meta: {} };
  });

  app.post('/api/v1/inventory/:productId/adjust', async (request, reply) => {
    const { shopId, userId } = await requireAuth(request);
    const { productId } = z.object({ productId: z.string().min(1) }).parse(request.params);
    const input = adjustmentInput.parse(request.body);
    const product = await prisma.product.findFirst({ where: { id: productId, shopId, isActive: true } });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);

    const positiveTypes: InventoryTransactionType[] = [InventoryTransactionType.PURCHASE, InventoryTransactionType.RETURN, InventoryTransactionType.ADJUSTMENT, InventoryTransactionType.STOCK_CORRECTION];
    const signedQuantity = positiveTypes.includes(input.type) ? input.quantity : -input.quantity;
    const nextStock = product.stockQuantity.plus(signedQuantity);
    if (nextStock.isNegative()) throw new AppError('INSUFFICIENT_STOCK', 'Stock cannot become negative', 409);

    const result = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.product.update({ where: { id: productId }, data: { stockQuantity: nextStock } });
      const movement = await transaction.inventoryTransaction.create({ data: { shopId, productId, type: input.type, quantity: input.quantity, unitCost: input.unitCost ?? null, reference: input.reference ?? null, createdBy: userId } });
      return { updated, movement };
    });
    return reply.status(201).send({ success: true, data: result, error: null, meta: {} });
  });
}
