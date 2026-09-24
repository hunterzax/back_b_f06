/*
  Warnings:

  - You are about to drop the column `input_reason_that_the_gas_is_not_in_the_gas_quality_requirement` on the `event_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."event_document" DROP COLUMN "input_reason_that_the_gas_is_not_in_the_gas_quality_requirement",
ADD COLUMN     "event_doc_master_id" INTEGER,
ADD COLUMN     "input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT,
ADD COLUMN     "ref_document" INTEGER,
ADD COLUMN     "ref_document_in" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
