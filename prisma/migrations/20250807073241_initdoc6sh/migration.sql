/*
  Warnings:

  - You are about to drop the column `doc_6_shipper_ref_gas_id` on the `event_document_emer` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."event_document_emer" DROP CONSTRAINT "event_document_emer_doc_6_shipper_ref_gas_id_fkey";

-- AlterTable
ALTER TABLE "public"."event_document_emer" DROP COLUMN "doc_6_shipper_ref_gas_id";

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_match" (
    "id" SERIAL NOT NULL,
    "event_doc_gas_shipper_id" INTEGER,
    "event_document_emer_id" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_match_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_match" ADD CONSTRAINT "event_doc_gas_shipper_match_event_doc_gas_shipper_id_fkey" FOREIGN KEY ("event_doc_gas_shipper_id") REFERENCES "public"."event_doc_gas_shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_match" ADD CONSTRAINT "event_doc_gas_shipper_match_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
