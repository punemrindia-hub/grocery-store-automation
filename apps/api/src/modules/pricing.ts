import { Prisma } from '@prisma/client';

export type PriceLine = { productId: string; name: string; unit: string; unitPrice: Prisma.Decimal; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal; taxRate: Prisma.Decimal };
export type PriceSummary = { lines: PriceLine[]; subtotal: Prisma.Decimal; discount: Prisma.Decimal; tax: Prisma.Decimal; deliveryCharge: Prisma.Decimal; total: Prisma.Decimal };

export function calculatePricing(lines: PriceLine[], deliveryCharge = new Prisma.Decimal(0)): PriceSummary {
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  const tax = lines.reduce((sum, line) => sum.plus(line.lineTotal.mul(line.taxRate).div(100)), new Prisma.Decimal(0));
  const discount = new Prisma.Decimal(0);
  return { lines, subtotal, discount, tax, deliveryCharge, total: subtotal.minus(discount).plus(tax).plus(deliveryCharge) };
}
