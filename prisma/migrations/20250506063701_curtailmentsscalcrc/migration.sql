/*
  Warnings:

  - You are about to drop the column `remainingCapacity` on the `curtailments_allocation_calc` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."curtailments_allocation_calc" DROP COLUMN "remainingCapacity",
ADD COLUMN     "remaining_capacity" INTEGER;
