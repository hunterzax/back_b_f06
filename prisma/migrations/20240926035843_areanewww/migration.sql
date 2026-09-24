/*
  Warnings:

  - You are about to alter the column `supply_reference_quality_area` on the `area` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to drop the column `zone_master_id` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the `zone_master` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."zone_master" DROP CONSTRAINT "zone_master_create_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."zone_master" DROP CONSTRAINT "zone_master_entry_exit_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."zone_master" DROP CONSTRAINT "zone_master_update_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."zone_master" DROP CONSTRAINT "zone_master_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."zone_master_quality" DROP CONSTRAINT "zone_master_quality_zone_master_id_fkey";

-- AlterTable
ALTER TABLE "public"."area" ALTER COLUMN "supply_reference_quality_area" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."zone_master_quality" DROP COLUMN "zone_master_id";

-- DropTable
DROP TABLE "public"."zone_master";

-- AddForeignKey
ALTER TABLE "public"."area" ADD CONSTRAINT "area_supply_reference_quality_area_fkey" FOREIGN KEY ("supply_reference_quality_area") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
