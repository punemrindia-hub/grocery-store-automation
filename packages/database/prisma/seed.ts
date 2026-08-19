import { PrismaClient, ProductUnit, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('development-only-change-me', 12);
  const shop = await prisma.shop.upsert({
    where: { slug: 'abc-grocery' },
    update: {},
    create: { name: 'ABC Grocery', slug: 'abc-grocery', settings: { create: {} } },
  });

  await prisma.user.upsert({
    where: { shopId_email: { shopId: shop.id, email: 'owner@abc-grocery.local' } },
    update: {},
    create: {
      shopId: shop.id,
      email: 'owner@abc-grocery.local',
      name: 'Store Owner',
      passwordHash,
      role: UserRole.OWNER,
    },
  });

  const category = await prisma.category.upsert({
    where: { shopId_name: { shopId: shop.id, name: 'Staples' } },
    update: {},
    create: { shopId: shop.id, name: 'Staples' },
  });

  await prisma.product.upsert({
    where: { shopId_sku: { shopId: shop.id, sku: 'RICE-001' } },
    update: {},
    create: {
      shopId: shop.id,
      categoryId: category.id,
      name: 'Basmati Rice',
      sku: 'RICE-001',
      unit: ProductUnit.KG,
      sellingPrice: 120,
      costPrice: 95,
      stockQuantity: 100,
      minimumStock: 10,
    },
  });
}

main().finally(() => prisma.$disconnect());
