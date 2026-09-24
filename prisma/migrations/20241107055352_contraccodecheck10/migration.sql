-- AlterTable
ALTER TABLE "public"."booking_full_json" ADD COLUMN     "flag_use" BOOLEAN;

-- AlterTable
ALTER TABLE "public"."booking_row_json" ADD COLUMN     "contract_point" TEXT,
ADD COLUMN     "flag_use" BOOLEAN;
