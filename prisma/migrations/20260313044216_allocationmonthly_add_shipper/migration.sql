-- AlterTable
ALTER TABLE "public"."allocation_monthly_report_approved" ADD COLUMN     "group_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."allocation_monthly_report_approved" ADD CONSTRAINT "allocation_monthly_report_approved_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
