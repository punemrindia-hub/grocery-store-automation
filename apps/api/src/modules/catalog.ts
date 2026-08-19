import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, ProductUnit } from '@prisma/client';
import { AppError } from '../errors.js';
import { requireAuth } from '../auth.js';

const prisma = new PrismaClient();
const categoryInput = z.object({ name: z.string().trim().min(1).max(80) });
const productInput = z.object({
  categoryId: z.string().min(1), name: z.string().trim().min(1).max(160), sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional(), unit: z.nativeEnum(ProductUnit), sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(), taxRate: z.number().min(0).max(100).default(0), stockQuantity: z.number().nonnegative().default(0), minimumStock: z.number().nonnegative().default(0),
});

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/categories', async (request) => {
    const { shopId } = await requireAuth(request);
    return { success: true, data: await prisma.category.findMany({ where: { shopId, isActive: true }, orderBy: { name: 'asc' } }), error: null, meta: {} };
  });

  app.post('/api/v1/categories', async (request, reply) => {
    const { shopId } = await requireAuth(request);
    const input = categoryInput.parse(request.body);
    const category = await prisma.category.create({ data: { shopId, name: input.name } });
    return reply.status(201).send({ success: true, data: category, error: null, meta: {} });
  });

  app.get('/api/v1/products', async (request) => {
    const { shopId } = await requireAuth(request);
    const products = await prisma.product.findMany({ where: { shopId, isActive: true }, include: { category: true }, orderBy: { name: 'asc' } });
    return { success: true, data: products, error: null, meta: {} };
  });

  app.post('/api/v1/products', async (request, reply) => {
    const { shopId } = await requireAuth(request);
    const input = productInput.parse(request.body);
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, shopId, isActive: true } });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found in this shop', 404);
    const data: Prisma.ProductUncheckedCreateInput = { ...input, shopId, barcode: input.barcode ?? null };
    const product = await prisma.product.create({ data });
    return reply.status(201).send({ success: true, data: product, error: null, meta: {} });
  });

  app.patch('/api/v1/products/:id', async (request) => {
    const { shopId } = await requireAuth(request);
    const productId = z.object({ id: z.string().min(1) }).parse(request.params).id;
    const input = productInput.partial().parse(request.body);
    if (input.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, shopId, isActive: true } });
      if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found in this shop', 404);
    }
    const existing = await prisma.product.findFirst({ where: { id: productId, shopId } });
    if (!existing) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const data: Prisma.ProductUncheckedUpdateInput = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    const product = await prisma.product.update({ where: { id: productId }, data });
    return { success: true, data: product, error: null, meta: {} };
  });
}
