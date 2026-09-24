-- AlterTable
ALTER TABLE "public"."event_runnumber_emer" ADD COLUMN     "event_doc_emer_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_event_doc_emer_type_id_fkey" FOREIGN KEY ("event_doc_emer_type_id") REFERENCES "public"."event_doc_emer_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
