-- AlterTable
ALTER TABLE "public"."zone_master_quality" ADD COLUMN     "zone_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."zone_master_quality" ADD CONSTRAINT "zone_master_quality_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
