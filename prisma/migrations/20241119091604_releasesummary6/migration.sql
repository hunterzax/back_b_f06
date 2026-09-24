/*
  Warnings:

  - You are about to drop the column `booking_version_comment_id` on the `booking_version` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."booking_version" DROP CONSTRAINT "booking_version_booking_version_comment_id_fkey";

-- AlterTable
ALTER TABLE "public"."booking_version" DROP COLUMN "booking_version_comment_id";

-- AlterTable
ALTER TABLE "public"."booking_version_comment" ADD COLUMN     "booking_version_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."booking_version_comment" ADD CONSTRAINT "booking_version_comment_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
