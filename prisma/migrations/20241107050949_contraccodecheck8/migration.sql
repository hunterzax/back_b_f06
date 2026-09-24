-- AlterTable
ALTER TABLE "public"."booking_full_json" ADD COLUMN     "create_by" INTEGER,
ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_by" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."booking_row_json" ADD COLUMN     "create_by" INTEGER,
ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_by" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."booking_full_json" ADD CONSTRAINT "booking_full_json_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_full_json" ADD CONSTRAINT "booking_full_json_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json" ADD CONSTRAINT "booking_row_json_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json" ADD CONSTRAINT "booking_row_json_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
