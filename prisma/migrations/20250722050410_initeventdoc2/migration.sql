/*
  Warnings:

  - You are about to drop the column `input_reason_that_the_gas_is_not_in_the_gas_quality_requirement` on the `event_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."event_document" DROP COLUMN "input_reason_that_the_gas_is_not_in_the_gas_quality_requirement",
ADD COLUMN     "doc2_input_date_time_of_the_incident" TEXT,
ADD COLUMN     "doc2_input_delivery_point_at_the_scene" TEXT,
ADD COLUMN     "doc2_input_duration_of_the_gas_travel_to_various_points" TEXT,
ADD COLUMN     "doc2_input_duration_that_is_expected_to_be_completed" TEXT,
ADD COLUMN     "doc2_input_gas_quality_is_not_in_the_gas_quality_requirements" TEXT,
ADD COLUMN     "doc2_input_note" TEXT,
ADD COLUMN     "doc2_input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT,
ADD COLUMN     "input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT;

-- CreateTable
CREATE TABLE "public"."event_document_email_group_for_event" (
    "id" SERIAL NOT NULL,
    "event_document_id" INTEGER,
    "edit_email_group_for_event_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_email_group_for_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_cc_email" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "event_document_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_cc_email_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_document_email_group_for_event" ADD CONSTRAINT "event_document_email_group_for_event_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "public"."event_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_email_group_for_event" ADD CONSTRAINT "event_document_email_group_for_event_edit_email_group_for__fkey" FOREIGN KEY ("edit_email_group_for_event_id") REFERENCES "public"."edit_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_email_group_for_event" ADD CONSTRAINT "event_document_email_group_for_event_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_email_group_for_event" ADD CONSTRAINT "event_document_email_group_for_event_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_cc_email" ADD CONSTRAINT "event_document_cc_email_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "public"."event_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_cc_email" ADD CONSTRAINT "event_document_cc_email_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_cc_email" ADD CONSTRAINT "event_document_cc_email_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
