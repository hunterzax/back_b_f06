/*
  Warnings:

  - A unique constraint covering the columns `[division_id]` on the table `division` will be added. If there are existing duplicate values, this will fail.
  - Made the column `division_id` on table `division` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."division_division_name_key";

-- AlterTable
ALTER TABLE "public"."division" ALTER COLUMN "division_name" DROP NOT NULL,
ALTER COLUMN "division_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "division_division_id_key" ON "public"."division"("division_id");
