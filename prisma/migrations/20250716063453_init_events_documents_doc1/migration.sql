-- AlterTable
ALTER TABLE "public"."event_document" ADD COLUMN     "input_date_time_of_the_incident" TEXT,
ADD COLUMN     "input_delivery_point_at_the_scene" TEXT,
ADD COLUMN     "input_duration_that_is_expected_to_be_completed" TEXT,
ADD COLUMN     "input_more" TEXT,
ADD COLUMN     "input_note" TEXT,
ADD COLUMN     "input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT;

-- CreateTable
CREATE TABLE "public"."event_document_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_document_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_file_pdf" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "buffer" BYTEA,
    "name" TEXT,
    "event_document_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_file_pdf_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_document_file" ADD CONSTRAINT "event_document_file_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "public"."event_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_file" ADD CONSTRAINT "event_document_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_file" ADD CONSTRAINT "event_document_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_file_pdf" ADD CONSTRAINT "event_document_file_pdf_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "public"."event_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_file_pdf" ADD CONSTRAINT "event_document_file_pdf_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_file_pdf" ADD CONSTRAINT "event_document_file_pdf_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
