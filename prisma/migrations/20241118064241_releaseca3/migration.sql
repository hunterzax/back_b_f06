/*
  Warnings:

  - You are about to drop the column `total` on the `release_capacity_submission_detail` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."release_capacity_submission_detail" DROP COLUMN "total",
ADD COLUMN     "total_contracted_mmbtu_d" TEXT,
ADD COLUMN     "total_release_mmbtu_d" TEXT;
