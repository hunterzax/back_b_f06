-- AlterTable
ALTER TABLE "public"."booking_version" ADD COLUMN     "status_capacity_request_management_id" INTEGER,
ADD COLUMN     "submitted_timestamp" TIMESTAMP(3),
ADD COLUMN     "type_account_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_status_capacity_request_management_id_fkey" FOREIGN KEY ("status_capacity_request_management_id") REFERENCES "public"."status_capacity_request_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_type_account_id_fkey" FOREIGN KEY ("type_account_id") REFERENCES "public"."type_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
