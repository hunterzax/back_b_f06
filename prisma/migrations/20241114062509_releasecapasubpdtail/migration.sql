-- AlterTable
ALTER TABLE "public"."release_capacity_submission_detail" ADD COLUMN     "entry_exit_id" INTEGER,
ADD COLUMN     "temp_area" TEXT,
ADD COLUMN     "temp_zone" TEXT;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
