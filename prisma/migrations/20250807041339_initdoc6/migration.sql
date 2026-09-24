-- AlterTable
ALTER TABLE "public"."event_document_emer" ADD COLUMN     "doc_6_input_note" TEXT,
ADD COLUMN     "doc_6_input_ref_doc_at" TEXT,
ADD COLUMN     "doc_6_input_when_date" TIMESTAMP(3),
ADD COLUMN     "doc_6_input_when_time" TEXT,
ADD COLUMN     "doc_6_shipper_ref_gas_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper" (
    "id" SERIAL NOT NULL,
    "ir" INTEGER,
    "nom_point" INTEGER,
    "nom_value_mmscfh" TEXT,
    "gas_command" TEXT,
    "gas_more" TEXT,
    "event_document_emer_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_doc_gas_shipper_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_file_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_doc_6_shipper_ref_gas_id_fkey" FOREIGN KEY ("doc_6_shipper_ref_gas_id") REFERENCES "public"."event_doc_gas_shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper" ADD CONSTRAINT "event_doc_gas_shipper_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper" ADD CONSTRAINT "event_doc_gas_shipper_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper" ADD CONSTRAINT "event_doc_gas_shipper_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file" ADD CONSTRAINT "event_doc_gas_shipper_file_event_doc_gas_shipper_id_fkey" FOREIGN KEY ("event_doc_gas_shipper_id") REFERENCES "public"."event_doc_gas_shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file" ADD CONSTRAINT "event_doc_gas_shipper_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_file" ADD CONSTRAINT "event_doc_gas_shipper_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
