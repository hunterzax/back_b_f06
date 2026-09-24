/*
  Warnings:

  - You are about to drop the column `color` on the `release_capacity_active` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `release_capacity_active` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."release_capacity_active" DROP COLUMN "color",
DROP COLUMN "name";
