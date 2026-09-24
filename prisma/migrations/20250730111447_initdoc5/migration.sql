-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "doc_5_input_event_date" TIMESTAMP(3),
ADD COLUMN     "doc_5_input_event_summary" TEXT,
ADD COLUMN     "doc_5_input_event_time" TEXT,
ADD COLUMN     "doc_5_input_more_info" TEXT,
ADD COLUMN     "doc_5_input_ref_doc_at" TEXT,
ADD COLUMN     "doc_5_input_summary_gas" TEXT;
