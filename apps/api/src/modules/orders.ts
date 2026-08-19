import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { FulfillmentType, InventoryTransactionType, LedgerDirection, LedgerType, PaymentMethod, PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { requireAuth } from '../auth.js';
import { AppError } from '../errors.js';
import { calculatePricing } from './pricing.js';
import { sendOrderStatusMessage } from './whatsapp.js';

const prisma = new PrismaClient();
const cartInput = z.object({ customerId: z.string().min(1) });
const itemInput = z.object({ productId: z.string().min(1), quantity: z.number().positive() });
const orderInput = z.object({ customerId: z.string().min(1), idempotencyKey: z.string().trim().min(8).max(120).optional(), source: z.string().trim().max(40).default('DASHBOARD') });
const statusInput = z.object({ status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) });
const posInput = z.object({ customerId: z.string().min(1).optional(), customerName: z.string().trim().min(1).max(120).optional(), customerWhatsapp: z.string().trim().min(8).max(20).optional(), paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH), fulfillmentType: z.nativeEnum(FulfillmentType).default(FulfillmentType.TAKEAWAY), items: z.array(itemInput).min(1), miscAmount: z.number().nonnegative().default(0), miscDescription: z.string().trim().max(100).default('Miscellaneous charge') });
const transitions: Record<string, string[]> = { PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'], READY: ['OUT_FOR_DELIVERY', 'CANCELLED'], OUT_FOR_DELIVERY: ['DELIVERED'] };

function orderNumber(): string { return `GRC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }

export async function createOrderFromActiveCart(input: { shopId: string; customerId: string; userId?: string; source: string; idempotencyKey?: string; fulfillmentType?: FulfillmentType }) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, shopId: input.shopId } });
  if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found in this shop', 404);
  const cart = await prisma.cart.findFirst({ where: { shopId: input.shopId, customerId: input.customerId, isActive: true }, include: { items: { include: { product: true } } } });
  if (!cart || cart.items.length === 0) throw new AppError('CART_EMPTY', 'Add products before creating an order', 400);
  const insufficient = cart.items.find((item) => item.quantity.gt(item.product.stockQuantity));
  if (insufficient) throw new AppError('INSUFFICIENT_STOCK', `${insufficient.product.name} does not have enough stock`, 409);
  const pricing = calculatePricing(cart.items.map((item) => ({ productId: item.productId, name: item.product.name, unit: item.product.unit, unitPrice: item.product.sellingPrice, quantity: item.quantity, lineTotal: item.product.sellingPrice.mul(item.quantity), taxRate: item.product.taxRate })));
  return prisma.$transaction(async (transaction) => {
    const created = await transaction.order.create({ data: { shopId: input.shopId, customerId: input.customerId, orderNumber: orderNumber(), source: input.source, fulfillmentType: input.fulfillmentType ?? FulfillmentType.TAKEAWAY, idempotencyKey: input.idempotencyKey ?? null, status: 'PENDING_CONFIRMATION', subtotal: pricing.subtotal, discount: pricing.discount, tax: pricing.tax, deliveryCharge: pricing.deliveryCharge, total: pricing.total, items: { create: pricing.lines.map((line) => ({ productId: line.productId, nameSnapshot: line.name, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal })) } }, include: { items: true } });
    await transaction.ledgerEntry.create({ data: { shopId: input.shopId, customerId: input.customerId, orderId: created.id, type: LedgerType.ORDER_CHARGE, direction: LedgerDirection.DEBIT, amount: pricing.total, description: `Order charge ${created.orderNumber}`, reference: created.orderNumber, createdBy: input.userId ?? null } });
    for (const item of cart.items) { await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } }); await transaction.inventoryTransaction.create({ data: { shopId: input.shopId, productId: item.productId, type: InventoryTransactionType.SALE, quantity: item.quantity, reference: created.orderNumber, createdBy: input.userId ?? null } }); }
    await transaction.cart.update({ where: { id: cart.id }, data: { isActive: false } });
    return created;
  });
}

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/carts', async (request, reply) => {
    const { shopId } = await requireAuth(request); const input = cartInput.parse(request.body);
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, shopId } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found in this shop', 404);
    const cart = await prisma.cart.upsert({ where: { id: `${shopId}:${input.customerId}` }, update: { isActive: true }, create: { id: `${shopId}:${input.customerId}`, shopId, customerId: input.customerId } }).catch(async () => prisma.cart.create({ data: { shopId, customerId: input.customerId } }));
    return reply.status(201).send({ success: true, data: cart, error: null, meta: {} });
  });

  app.get('/api/v1/carts/:cartId', async (request) => {
    const { shopId } = await requireAuth(request); const { cartId } = z.object({ cartId: z.string().min(1) }).parse(request.params);
    const cart = await prisma.cart.findFirst({ where: { id: cartId, shopId, isActive: true }, include: { customer: true, items: { include: { product: { include: { category: true } } } } } });
    if (!cart) throw new AppError('CART_NOT_FOUND', 'Cart not found', 404);
    const pricing = calculatePricing(cart.items.map((item) => ({ productId: item.productId, name: item.product.name, unit: item.product.unit, unitPrice: item.product.sellingPrice, quantity: item.quantity, lineTotal: item.product.sellingPrice.mul(item.quantity), taxRate: item.product.taxRate })));
    return { success: true, data: { ...cart, pricing }, error: null, meta: {} };
  });

  app.post('/api/v1/carts/:cartId/items', async (request, reply) => {
    const { shopId } = await requireAuth(request); const { cartId } = z.object({ cartId: z.string().min(1) }).parse(request.params); const input = itemInput.parse(request.body);
    const cart = await prisma.cart.findFirst({ where: { id: cartId, shopId, isActive: true } }); const product = await prisma.product.findFirst({ where: { id: input.productId, shopId, isActive: true } });
    if (!cart) throw new AppError('CART_NOT_FOUND', 'Cart not found', 404); if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const item = await prisma.cartItem.upsert({ where: { cartId_productId: { cartId, productId: product.id } }, update: { quantity: { increment: input.quantity } }, create: { cartId, productId: product.id, quantity: input.quantity } });
    return reply.status(201).send({ success: true, data: item, error: null, meta: {} });
  });

  app.post('/api/v1/orders', async (request, reply) => {
    const { shopId, userId } = await requireAuth(request); const input = orderInput.parse(request.body);
    if (input.idempotencyKey) { const existing = await prisma.order.findUnique({ where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } }, include: { items: true } }); if (existing) return reply.send({ success: true, data: existing, error: null, meta: { idempotent: true } }); }
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, shopId } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found in this shop', 404);
    const cart = await prisma.cart.findFirst({ where: { shopId, customerId: input.customerId, isActive: true }, include: { items: { include: { product: true } } } });
    if (!cart || cart.items.length === 0) throw new AppError('CART_EMPTY', 'Add products before creating an order', 400);
    const insufficient = cart.items.find((item) => item.quantity.gt(item.product.stockQuantity));
    if (insufficient) throw new AppError('INSUFFICIENT_STOCK', `${insufficient.product.name} does not have enough stock`, 409);
    const pricing = calculatePricing(cart.items.map((item) => ({ productId: item.productId, name: item.product.name, unit: item.product.unit, unitPrice: item.product.sellingPrice, quantity: item.quantity, lineTotal: item.product.sellingPrice.mul(item.quantity), taxRate: item.product.taxRate })));
    const order = await prisma.$transaction(async (transaction) => {
      const created = await transaction.order.create({ data: { shopId, customerId: input.customerId, orderNumber: orderNumber(), source: input.source, idempotencyKey: input.idempotencyKey ?? null, status: 'PENDING_CONFIRMATION', subtotal: pricing.subtotal, discount: pricing.discount, tax: pricing.tax, deliveryCharge: pricing.deliveryCharge, total: pricing.total, items: { create: pricing.lines.map((line) => ({ productId: line.productId, nameSnapshot: line.name, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal })) } }, include: { items: true } });
      await transaction.ledgerEntry.create({ data: { shopId, customerId: input.customerId, orderId: created.id, type: LedgerType.ORDER_CHARGE, direction: LedgerDirection.DEBIT, amount: pricing.total, description: `Order charge ${created.orderNumber}`, reference: created.orderNumber, createdBy: userId } });
      for (const item of cart.items) { await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } }); await transaction.inventoryTransaction.create({ data: { shopId, productId: item.productId, type: InventoryTransactionType.SALE, quantity: item.quantity, reference: created.orderNumber, createdBy: userId } }); }
      await transaction.cart.update({ where: { id: cart.id }, data: { isActive: false } });
      return created;
    });
    return reply.status(201).send({ success: true, data: order, error: null, meta: {} });
  });

  app.get('/api/v1/orders', async (request) => { const { shopId } = await requireAuth(request); const orders = await prisma.order.findMany({ where: { shopId }, include: { customer: true, items: true }, orderBy: { createdAt: 'desc' } }); return { success: true, data: orders, error: null, meta: {} }; });

  app.patch('/api/v1/orders/:orderId/status', async (request) => {
    const { shopId, userId } = await requireAuth(request); const { orderId } = z.object({ orderId: z.string().min(1) }).parse(request.params); const { status } = statusInput.parse(request.body);
    const order = await prisma.order.findFirst({ where: { id: orderId, shopId }, include: { customer: true, items: true } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (!transitions[order.status]?.includes(status)) throw new AppError('INVALID_ORDER_TRANSITION', `Cannot move order from ${order.status} to ${status}`, 409);
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.order.update({ where: { id: order.id }, data: { status } });
      if (status === 'CANCELLED') {
        for (const item of order.items) { await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } }); await transaction.inventoryTransaction.create({ data: { shopId, productId: item.productId, type: InventoryTransactionType.RETURN, quantity: item.quantity, reference: order.orderNumber, createdBy: userId } }); }
      }
      await transaction.auditLog.create({ data: { shopId, userId, action: `ORDER_${status}`, entity: 'Order', entityId: order.id, before: { status: order.status }, after: { status }, } });
      return result;
    });
    await sendOrderStatusMessage(prisma, { shopId, customerId: order.customerId, orderId: order.id, recipient: order.customer.whatsappNumber, orderNumber: order.orderNumber, status });
    return { success: true, data: updated, error: null, meta: { notificationProvider: 'mock' } };
  });

  app.post('/api/v1/pos/orders', async (request, reply) => {
    const { shopId, userId } = await requireAuth(request); const input = posInput.parse(request.body);
    let customer = input.customerId ? await prisma.customer.findFirst({ where: { id: input.customerId, shopId } }) : null;
    if (input.customerId && !customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found in this shop', 404);
    if (!customer) customer = await prisma.customer.create({ data: { shopId, name: input.customerName ?? 'Walk-in Customer', whatsappNumber: input.customerWhatsapp ?? `walk-in-${crypto.randomUUID()}` } });
    const products = await prisma.product.findMany({ where: { shopId, isActive: true, id: { in: input.items.map((item) => item.productId) } } });
    if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw new AppError('PRODUCT_NOT_FOUND', 'One or more products were not found', 404);
    const lines = input.items.map((item) => { const product = products.find((candidate) => candidate.id === item.productId)!; if (new Prisma.Decimal(item.quantity).gt(product.stockQuantity)) throw new AppError('INSUFFICIENT_STOCK', `${product.name} does not have enough stock`, 409); return { productId: product.id, name: product.name, unit: product.unit, unitPrice: product.sellingPrice, quantity: new Prisma.Decimal(item.quantity), lineTotal: product.sellingPrice.mul(item.quantity), taxRate: product.taxRate }; });
    const pricing = calculatePricing(lines);
    const misc = new Prisma.Decimal(input.miscAmount);
    const finalTotal = pricing.total.add(misc);
    const order = await prisma.$transaction(async (transaction) => {
      const created = await transaction.order.create({ data: { shopId, customerId: customer!.id, orderNumber: orderNumber(), source: 'POS', fulfillmentType: input.fulfillmentType, status: 'CONFIRMED', subtotal: pricing.subtotal, discount: pricing.discount, tax: pricing.tax, deliveryCharge: pricing.deliveryCharge.add(misc), total: finalTotal, paymentMethod: input.paymentMethod, items: { create: pricing.lines.map((line) => ({ productId: line.productId, nameSnapshot: line.name, unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal })) } }, include: { items: true } });
      await transaction.ledgerEntry.create({ data: { shopId, customerId: customer!.id, orderId: created.id, type: LedgerType.ORDER_CHARGE, direction: LedgerDirection.DEBIT, amount: finalTotal, description: `POS order charge ${created.orderNumber}`, reference: created.orderNumber, createdBy: userId } });
      const paymentStatus = input.paymentMethod === PaymentMethod.CREDIT ? PaymentStatus.CREDIT : input.paymentMethod === PaymentMethod.CASH ? PaymentStatus.CASH : PaymentStatus.PAID;
      const payment = await transaction.payment.create({ data: { shopId, customerId: customer!.id, orderId: created.id, amount: finalTotal, method: input.paymentMethod, status: paymentStatus, provider: 'POS' } });
      if (input.paymentMethod !== PaymentMethod.CREDIT) await transaction.ledgerEntry.create({ data: { shopId, customerId: customer!.id, orderId: created.id, paymentId: payment.id, type: LedgerType.PAYMENT, direction: LedgerDirection.CREDIT, amount: finalTotal, description: `POS ${input.paymentMethod.toLowerCase()} payment`, reference: payment.id, createdBy: userId } });
      for (const item of input.items) { await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } }); await transaction.inventoryTransaction.create({ data: { shopId, productId: item.productId, type: InventoryTransactionType.SALE, quantity: item.quantity, reference: created.orderNumber, createdBy: userId } }); }
      const invoice = await transaction.invoice.create({ data: { shopId, orderId: created.id, invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`, amountPaid: input.paymentMethod === PaymentMethod.CREDIT ? 0 : pricing.total, amountPending: input.paymentMethod === PaymentMethod.CREDIT ? pricing.total : 0 } });
      return { created, payment, invoice };
    });
    return reply.status(201).send({ success: true, data: order, error: null, meta: {} });
  });
}
