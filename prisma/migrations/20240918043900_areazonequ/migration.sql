-- AlterTable
ALTER TABLE "public"."zone_master_quality" ADD COLUMN     "zone_master_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."zone_master_quality" ADD CONSTRAINT "zone_master_quality_zone_master_id_fkey" FOREIGN KEY ("zone_master_id") REFERENCES "public"."zone_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
