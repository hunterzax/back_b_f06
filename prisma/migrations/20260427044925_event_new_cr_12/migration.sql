/*
  Warnings:

  - A unique constraint covering the columns `[account_id]` on the table `account_manage` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[account_manage_id]` on the table `account_role` will be added. If there are existing duplicate values, this will fail.
  - Made the column `account_manage_id` on table `account_role` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."account_role" DROP CONSTRAINT "account_role_account_manage_id_fkey";

-- AlterTable
ALTER TABLE "public"."account_role" ALTER COLUMN "account_manage_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."event_document" ADD COLUMN     "disabled_flag" BOOLEAN,
ADD COLUMN     "document_code" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "disabled_flag" BOOLEAN,
ADD COLUMN     "document_code" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_document_ofo" ADD COLUMN     "disabled_flag" BOOLEAN,
ADD COLUMN     "document_code" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_runnumber" ADD COLUMN     "zone_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_runnumber_emer" ADD COLUMN     "zone_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_runnumber_ofo" ADD COLUMN     "zone_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "account_manage_account_id_key" ON "public"."account_manage"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_role_account_manage_id_key" ON "public"."account_role"("account_manage_id");

-- AddForeignKey
ALTER TABLE "public"."account_role" ADD CONSTRAINT "account_role_account_manage_id_fkey" FOREIGN KEY ("account_manage_id") REFERENCES "public"."account_manage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
