/*
  Warnings:

  - You are about to drop the column `vrsion` on the `booking_version` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."booking_version" DROP COLUMN "vrsion",
ADD COLUMN     "version" TEXT;
