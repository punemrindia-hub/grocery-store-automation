import type { PrismaClient } from '@prisma/client';

export type WhatsAppText = { to: string; body: string };

export interface WhatsAppProvider {
  sendText(message: WhatsAppText): Promise<{ provider: string; providerMessageId: string }>;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendText(_message: WhatsAppText): Promise<{ provider: string; providerMessageId: string }> {
    void _message;
    return { provider: 'mock', providerMessageId: `mock-${crypto.randomUUID()}` };
  }
}

export async function queueWhatsAppInvoice(prisma: PrismaClient, input: { shopId: string; customerId: string; orderId: string; recipient: string; invoiceNumber: string; total: string }): Promise<void> {
  const provider = new MockWhatsAppProvider();
  const body = `Invoice ${input.invoiceNumber} from ABC Grocery. Total: INR ${input.total}. Payment integration is not configured; please contact the shop for payment options.`;
  const sent = await provider.sendText({ to: input.recipient, body });
  await prisma.whatsAppMessage.create({ data: { shopId: input.shopId, customerId: input.customerId, orderId: input.orderId, direction: 'OUTBOUND', messageType: 'INVOICE', recipient: input.recipient, body, provider: sent.provider, providerMessageId: sent.providerMessageId, status: 'SENT', sentAt: new Date() } });
}

export async function sendOrderStatusMessage(prisma: PrismaClient, input: { shopId: string; customerId: string; orderId: string; recipient: string; orderNumber: string; status: string }): Promise<void> {
  const bodyByStatus: Record<string, string> = { CONFIRMED: `Order ${input.orderNumber} confirmed. आपका ऑर्डर पक्का हो गया है।`, PREPARING: `Order ${input.orderNumber} is being prepared. आपका ऑर्डर तैयार किया जा रहा है।`, READY: `Order ${input.orderNumber} is ready. आपका ऑर्डर तैयार है।`, OUT_FOR_DELIVERY: `Order ${input.orderNumber} is out for delivery. आपका ऑर्डर डिलीवरी के लिए निकल गया है।`, DELIVERED: `Order ${input.orderNumber} delivered. धन्यवाद!`, CANCELLED: `Order ${input.orderNumber} cancelled. आपका ऑर्डर रद्द कर दिया गया है।` };
  const body = bodyByStatus[input.status] ?? `Order ${input.orderNumber} status: ${input.status}`;
  const sent = await new MockWhatsAppProvider().sendText({ to: input.recipient, body });
  await prisma.whatsAppMessage.create({ data: { shopId: input.shopId, customerId: input.customerId, orderId: input.orderId, direction: 'OUTBOUND', messageType: 'ORDER_STATUS', recipient: input.recipient, body, provider: sent.provider, providerMessageId: sent.providerMessageId, status: 'SENT', sentAt: new Date() } });
}
