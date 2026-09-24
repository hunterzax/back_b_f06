-- AlterTable
ALTER TABLE "public"."booking_row_json" ADD COLUMN     "entry_exit_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json" ADD CONSTRAINT "booking_row_json_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
