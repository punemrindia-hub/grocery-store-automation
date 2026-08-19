import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { FulfillmentType, PrismaClient } from '@prisma/client';
import { AppError } from '../errors.js';
import { createOrderFromActiveCart } from './orders.js';
import { MockWhatsAppProvider } from './whatsapp.js';

const prisma = new PrismaClient();
const provider = new MockWhatsAppProvider();
const inbound = z.object({ shopSlug: z.string().min(1), from: z.string().min(8).max(20), text: z.string().trim().min(1).max(2000), messageId: z.string().min(1).max(200).optional() });
const states = ['GREETING', 'CATEGORY_SELECTION', 'PRODUCT_SELECTION', 'QUANTITY', 'CART_REVIEW', 'COMPLETED'] as const;
type ConversationState = typeof states[number];
type ConversationMetadata = { categoryId?: string; productId?: string };

function normalized(value: string): string { return value.trim().toLocaleLowerCase('en-IN'); }
function isYes(value: string): boolean { return ['yes', 'y', 'haan', 'ha', 'हाँ', 'हां'].includes(normalized(value)); }
function isGreeting(value: string): boolean { return ['hi', 'hello', 'start', 'नमस्ते', 'नमस्कार'].includes(normalized(value)); }
function formatMoney(value: { toFixed: (digits: number) => string }): string { return `INR ${value.toFixed(2)}`; }

export async function registerWhatsAppAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = z.object({ 'hub.mode': z.string().optional(), 'hub.verify_token': z.string().optional(), 'hub.challenge': z.string().optional() }).parse(request.query);
    if (query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== process.env.WHATSAPP_VERIFY_TOKEN) throw new AppError('WEBHOOK_VERIFICATION_FAILED', 'Webhook verification failed', 403);
    return reply.type('text/plain').send(query['hub.challenge'] ?? '');
  });

  app.post('/webhooks/whatsapp', async (request) => {
    const input = inbound.parse(request.body); const providerMessageId = input.messageId ?? `in-${crypto.randomUUID()}`;
    const existing = await prisma.whatsAppMessage.findFirst({ where: { provider: 'mock', providerMessageId } });
    if (existing) return { success: true, data: { duplicate: true, messageId: existing.id }, error: null, meta: { idempotent: true } };
    const shop = await prisma.shop.findUnique({ where: { slug: input.shopSlug } });
    if (!shop) throw new AppError('SHOP_NOT_FOUND', 'Shop not found', 404);
    const customer = await prisma.customer.findUnique({ where: { shopId_whatsappNumber: { shopId: shop.id, whatsappNumber: input.from } } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer is not registered with this shop', 404);
    await prisma.whatsAppMessage.create({ data: { shopId: shop.id, customerId: customer.id, direction: 'INBOUND', messageType: 'TEXT', recipient: input.from, body: input.text, provider: 'mock', providerMessageId, status: 'RECEIVED' } });
    const conversation = await prisma.conversation.upsert({ where: { shopId_customerId: { shopId: shop.id, customerId: customer.id } }, update: { lastMessageAt: new Date() }, create: { shopId: shop.id, customerId: customer.id, state: 'GREETING', lastMessageAt: new Date() } });
    const metadata = (conversation.metadata ?? {}) as ConversationMetadata;
    const currentState = states.includes(conversation.state as ConversationState) ? conversation.state as ConversationState : 'GREETING';
    let nextState: ConversationState = currentState;
    let body = '';
    let orderCreated = false;

    if (isGreeting(input.text)) {
      const categories = await prisma.category.findMany({ where: { shopId: shop.id, isActive: true }, orderBy: { name: 'asc' } });
      body = `Welcome to ${shop.name}! 🛒\n\nChoose a category:\n${categories.map((category, index) => `${index + 1}. ${category.name}`).join('\n')}\n\nCategory ka naam bhejiye.`;
      nextState = 'CATEGORY_SELECTION';
    } else if (currentState === 'CATEGORY_SELECTION' || currentState === 'GREETING') {
      const category = await prisma.category.findFirst({ where: { shopId: shop.id, isActive: true, name: { equals: input.text, mode: 'insensitive' } } });
      if (!category) { body = 'Please send a category name from the list. कृपया सूची से श्रेणी का नाम भेजें।'; nextState = 'CATEGORY_SELECTION'; }
      else {
        const products = await prisma.product.findMany({ where: { shopId: shop.id, categoryId: category.id, isActive: true, stockQuantity: { gt: 0 } }, orderBy: { name: 'asc' } });
        body = `${category.name}\n\n${products.map((product, index) => `${index + 1}. ${product.name} - ${formatMoney(product.sellingPrice)} / ${product.unit}`).join('\n')}\n\nProduct ka naam bhejiye.`;
        nextState = 'PRODUCT_SELECTION';
        metadata.categoryId = category.id;
      }
    } else if (currentState === 'PRODUCT_SELECTION') {
      const product = metadata.categoryId ? await prisma.product.findFirst({ where: { shopId: shop.id, categoryId: metadata.categoryId, isActive: true, stockQuantity: { gt: 0 }, name: { equals: input.text, mode: 'insensitive' } } }) : null;
      if (!product) { body = 'Please send a product name from the list. कृपया सूची से उत्पाद का नाम भेजें।'; nextState = 'PRODUCT_SELECTION'; }
      else { body = `${product.name}\n${formatMoney(product.sellingPrice)} / ${product.unit}\n\nHow much would you like? Quantity bhejiye.`; nextState = 'QUANTITY'; metadata.productId = product.id; }
    } else if (currentState === 'QUANTITY') {
      const quantity = Number(input.text); const product = metadata.productId ? await prisma.product.findFirst({ where: { id: metadata.productId, shopId: shop.id, isActive: true } }) : null;
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || quantity > Number(product.stockQuantity)) { body = 'Please send a valid quantity available in stock. सही मात्रा भेजें।'; nextState = 'QUANTITY'; }
      else {
        const cart = await prisma.cart.upsert({ where: { id: `${shop.id}:${customer.id}` }, update: { isActive: true }, create: { id: `${shop.id}:${customer.id}`, shopId: shop.id, customerId: customer.id } });
        await prisma.cartItem.upsert({ where: { cartId_productId: { cartId: cart.id, productId: product.id } }, update: { quantity: { increment: quantity } }, create: { cartId: cart.id, productId: product.id, quantity } });
        const cartItems = await prisma.cartItem.findMany({ where: { cartId: cart.id }, include: { product: true } });
        const total = cartItems.reduce((sum, item) => sum + Number(item.product.sellingPrice) * Number(item.quantity), 0);
        body = `Cart summary:\n${cartItems.map((item) => `${item.product.name} x ${item.quantity} = INR ${(Number(item.product.sellingPrice) * Number(item.quantity)).toFixed(2)}`).join('\n')}\n\nTotal: INR ${total.toFixed(2)}\n\nOrder place karne ke liye YES bhejiye.`;
        nextState = 'CART_REVIEW';
      }
    } else if (currentState === 'CART_REVIEW' && isYes(input.text)) {
      const order = await createOrderFromActiveCart({ shopId: shop.id, customerId: customer.id, source: 'WHATSAPP', fulfillmentType: FulfillmentType.DELIVERY });
      body = `Order ${order.orderNumber} created successfully. Total: ${formatMoney(order.total)}. We will start preparing your order.`;
      nextState = 'COMPLETED'; orderCreated = true;
    } else {
      body = 'Order confirm karne ke liye YES bhejiye. ऑर्डर की पुष्टि के लिए YES भेजें।'; nextState = 'CART_REVIEW';
    }

    await prisma.conversation.update({ where: { id: conversation.id }, data: { state: nextState, metadata, lastMessageAt: new Date() } });
    const sent = await provider.sendText({ to: input.from, body });
    await prisma.whatsAppMessage.create({ data: { shopId: shop.id, customerId: customer.id, direction: 'OUTBOUND', messageType: 'TEXT', recipient: input.from, body, provider: sent.provider, providerMessageId: sent.providerMessageId, status: 'SENT', sentAt: new Date() } });
    return { success: true, data: { accepted: true, state: nextState, orderCreated }, error: null, meta: { provider: sent.provider } };
  });
}
