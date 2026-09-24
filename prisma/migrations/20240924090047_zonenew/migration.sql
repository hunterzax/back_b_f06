-- AlterTable
ALTER TABLE "public"."zone" ADD COLUMN     "description" TEXT,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "entry_exit_id" INTEGER,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "public"."zone" ADD CONSTRAINT "zone_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
