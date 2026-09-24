/*
  Warnings:

  - You are about to drop the column `customer_type_text` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `intraday_value` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `point_type_text` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `previous_value` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `relation_point_text` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `relation_point_type_text` on the `allocation_management` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `allocation_management` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."allocation_management" DROP COLUMN "customer_type_text",
DROP COLUMN "intraday_value",
DROP COLUMN "point_type_text",
DROP COLUMN "previous_value",
DROP COLUMN "relation_point_text",
DROP COLUMN "relation_point_type_text",
DROP COLUMN "value";
