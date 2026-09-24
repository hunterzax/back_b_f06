-- AlterTable
ALTER TABLE "public"."event_runnumber_emer" ADD COLUMN     "event_doc_emer_gas_tranmiss_id" INTEGER,
ADD COLUMN     "event_doc_emer_gas_tranmiss_other" TEXT;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_event_doc_emer_gas_tranmiss_id_fkey" FOREIGN KEY ("event_doc_emer_gas_tranmiss_id") REFERENCES "public"."event_doc_emer_gas_tranmiss"("id") ON DELETE SET NULL ON UPDATE CASCADE;
