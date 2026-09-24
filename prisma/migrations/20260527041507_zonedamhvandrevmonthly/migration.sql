-- AlterTable
ALTER TABLE "public"."allocation_monthly_report_approved" ADD COLUMN     "rev" INTEGER;

-- AlterTable
ALTER TABLE "public"."balancing_monthly_report_approved" ADD COLUMN     "rev" INTEGER;

-- AlterTable
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD COLUMN     "zone_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
