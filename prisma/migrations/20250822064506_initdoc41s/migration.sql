-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "doc_41_input_date_time_of_the_incident" TEXT,
ADD COLUMN     "doc_41_input_detail_incident" TEXT,
ADD COLUMN     "doc_41_input_expected_day_time" TEXT,
ADD COLUMN     "doc_41_input_incident" TEXT;

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_41" (
    "id" SERIAL NOT NULL,
    "ir" INTEGER,
    "io" INTEGER,
    "iother" INTEGER,
    "value" TEXT,
    "more" TEXT,
    "event_document_emer_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_41_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_match_41" (
    "id" SERIAL NOT NULL,
    "event_doc_gas_shipper_41_id" INTEGER,
    "event_document_emer_id" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_match_41_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_file_41" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_doc_gas_shipper_41_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_file_41_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_41" ADD CONSTRAINT "event_doc_gas_shipper_41_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_41" ADD CONSTRAINT "event_doc_gas_shipper_41_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_41" ADD CONSTRAINT "event_doc_gas_shipper_41_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_match_41" ADD CONSTRAINT "event_doc_gas_shipper_match_41_event_doc_gas_shipper_41_id_fkey" FOREIGN KEY ("event_doc_gas_shipper_41_id") REFERENCES "public"."event_doc_gas_shipper_41"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_match_41" ADD CONSTRAINT "event_doc_gas_shipper_match_41_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file_41" ADD CONSTRAINT "event_doc_gas_shipper_file_41_event_doc_gas_shipper_41_id_fkey" FOREIGN KEY ("event_doc_gas_shipper_41_id") REFERENCES "public"."event_doc_gas_shipper_41"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file_41" ADD CONSTRAINT "event_doc_gas_shipper_file_41_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file_41" ADD CONSTRAINT "event_doc_gas_shipper_file_41_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
