/*
  Warnings:

  - You are about to drop the column `name` on the `contract_point` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `nomination_point` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."contract_point" DROP COLUMN "name",
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "public"."nomination_point" DROP COLUMN "name",
ADD COLUMN     "description" TEXT;
