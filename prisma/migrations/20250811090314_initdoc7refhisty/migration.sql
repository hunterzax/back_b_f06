/*
  Warnings:

  - You are about to drop the column `event_document_emer_id` on the `event_document_ofo_log_history` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" DROP CONSTRAINT "event_document_ofo_log_history_event_document_emer_id_fkey";

-- AlterTable
ALTER TABLE "public"."event_document_ofo_log_history" DROP COLUMN "event_document_emer_id",
ADD COLUMN     "event_document_ofo_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
