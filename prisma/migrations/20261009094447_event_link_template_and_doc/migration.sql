-- AlterTable
ALTER TABLE "public"."event_document" ADD COLUMN     "doc_1_template_history_id" INTEGER,
ADD COLUMN     "doc_2_template_history_id" INTEGER,
ADD COLUMN     "doc_3_template_history_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "doc_39_template_history_id" INTEGER,
ADD COLUMN     "doc_41_template_history_id" INTEGER,
ADD COLUMN     "doc_5_template_history_id" INTEGER,
ADD COLUMN     "doc_6_template_history_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_document_ofo" ADD COLUMN     "doc_7_input_ref_1_text" TEXT,
ADD COLUMN     "doc_7_input_ref_2_text" TEXT,
ADD COLUMN     "doc_7_template_history_id" INTEGER,
ADD COLUMN     "doc_8_template_history_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_doc_1_template_history_id_fkey" FOREIGN KEY ("doc_1_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_doc_2_template_history_id_fkey" FOREIGN KEY ("doc_2_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_doc_3_template_history_id_fkey" FOREIGN KEY ("doc_3_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_39_template_history_id_fkey" FOREIGN KEY ("doc_39_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_41_template_history_id_fkey" FOREIGN KEY ("doc_41_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_5_template_history_id_fkey" FOREIGN KEY ("doc_5_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_6_template_history_id_fkey" FOREIGN KEY ("doc_6_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_template_history_id_fkey" FOREIGN KEY ("doc_7_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_8_template_history_id_fkey" FOREIGN KEY ("doc_8_template_history_id") REFERENCES "public"."event_template_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;
