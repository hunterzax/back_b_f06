/*
  Warnings:

  - You are about to drop the column `doc_7_ofo_refer_id` on the `event_document_ofo` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."event_document_ofo" DROP CONSTRAINT "event_document_ofo_doc_7_ofo_refer_id_fkey";

-- AlterTable
ALTER TABLE "public"."event_document_ofo" DROP COLUMN "doc_7_ofo_refer_id",
ADD COLUMN     "doc_7_input_ref_1_id" INTEGER,
ADD COLUMN     "doc_7_input_ref_2_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_input_ref_1_id_fkey" FOREIGN KEY ("doc_7_input_ref_1_id") REFERENCES "public"."event_doc_ofo_refer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_input_ref_2_id_fkey" FOREIGN KEY ("doc_7_input_ref_2_id") REFERENCES "public"."event_doc_ofo_refer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
