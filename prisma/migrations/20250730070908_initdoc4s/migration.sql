-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "doc_4_input_date_time_of_the_incident" TEXT,
ADD COLUMN     "doc_4_input_detail_incident" TEXT,
ADD COLUMN     "doc_4_input_expected_day_time" TEXT,
ADD COLUMN     "doc_4_input_incident" TEXT,
ADD COLUMN     "doc_4_input_note" TEXT,
ADD COLUMN     "doc_4_input_order_io_id" INTEGER,
ADD COLUMN     "doc_4_input_order_ir_id" INTEGER,
ADD COLUMN     "doc_4_input_order_other_id" INTEGER,
ADD COLUMN     "doc_4_input_order_other_value" TEXT,
ADD COLUMN     "doc_4_input_shipper_note" TEXT,
ADD COLUMN     "doc_4_input_shipper_operation" TEXT;

-- CreateTable
CREATE TABLE "public"."event_doc_emer_order" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "event_doc_emer_order_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_4_input_order_ir_id_fkey" FOREIGN KEY ("doc_4_input_order_ir_id") REFERENCES "public"."event_doc_emer_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_4_input_order_io_id_fkey" FOREIGN KEY ("doc_4_input_order_io_id") REFERENCES "public"."event_doc_emer_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_4_input_order_other_id_fkey" FOREIGN KEY ("doc_4_input_order_other_id") REFERENCES "public"."event_doc_emer_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
