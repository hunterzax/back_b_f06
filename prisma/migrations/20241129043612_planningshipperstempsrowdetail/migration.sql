-- AlterTable
ALTER TABLE "public"."newpoint_detail" ADD COLUMN     "entry_exit_id" INTEGER,
ADD COLUMN     "temp_area" TEXT,
ADD COLUMN     "temp_customer" TEXT,
ADD COLUMN     "temp_new_point" TEXT,
ADD COLUMN     "temp_nomination_point" TEXT,
ADD COLUMN     "temp_point_type" TEXT,
ADD COLUMN     "temp_unit" TEXT;

-- AddForeignKey
ALTER TABLE "public"."newpoint_detail" ADD CONSTRAINT "newpoint_detail_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
