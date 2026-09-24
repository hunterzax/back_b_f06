-- AlterTable
ALTER TABLE "public"."edit_email_group_for_event" ADD COLUMN     "group_id" INTEGER,
ADD COLUMN     "user_type_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."event_document" ADD COLUMN     "doc3_input_shipper_doc_number" TEXT,
ADD COLUMN     "doc3_input_shipper_doc_quality" TEXT,
ADD COLUMN     "doc3_input_shipper_down_date" TIMESTAMP(3),
ADD COLUMN     "doc3_input_shipper_time_event_end_date" TIMESTAMP(3),
ADD COLUMN     "doc3_input_shipper_time_event_end_time" TEXT,
ADD COLUMN     "doc3_input_shipper_time_event_start_date" TIMESTAMP(3),
ADD COLUMN     "doc3_input_shipper_time_event_start_time" TEXT,
ADD COLUMN     "doc3_input_shipper_time_event_summary" TEXT,
ADD COLUMN     "doc3_input_tso_disapeared_date" TIMESTAMP(3),
ADD COLUMN     "doc3_input_tso_disapeared_time" TIMESTAMP(3),
ADD COLUMN     "doc3_input_tso_doc_number" TEXT,
ADD COLUMN     "doc3_input_tso_down_date" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event" ADD CONSTRAINT "edit_email_group_for_event_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event" ADD CONSTRAINT "edit_email_group_for_event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
