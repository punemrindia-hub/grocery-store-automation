-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('TAKEAWAY', 'DELIVERY');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'TAKEAWAY';
