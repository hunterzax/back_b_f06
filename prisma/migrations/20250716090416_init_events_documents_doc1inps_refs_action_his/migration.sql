/*
  Warnings:

  - You are about to drop the column `input_reason_that_the_gas_is_not_in_the_gas_quality_requirement` on the `event_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."event_document" DROP COLUMN "input_reason_that_the_gas_is_not_in_the_gas_quality_requirement",
ADD COLUMN     "input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT;

-- CreateTable
CREATE TABLE "public"."event_document_log_history" (
    "id" SERIAL NOT NULL,
    "temp" TEXT,
    "event_document_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_log_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_document_log_history" ADD CONSTRAINT "event_document_log_history_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "public"."event_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_log_history" ADD CONSTRAINT "event_document_log_history_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_log_history" ADD CONSTRAINT "event_document_log_history_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_log_history" ADD CONSTRAINT "event_document_log_history_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_log_history" ADD CONSTRAINT "event_document_log_history_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
