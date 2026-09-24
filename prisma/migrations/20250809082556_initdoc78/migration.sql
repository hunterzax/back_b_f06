-- CreateTable
CREATE TABLE "public"."event_runnumber_ofo" (
    "id" SERIAL NOT NULL,
    "event_nember" TEXT,
    "event_date" TIMESTAMP(3),
    "event_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "event_doc_ofo_type_id" INTEGER,
    "event_doc_ofo_gas_tranmiss_id" INTEGER,
    "event_doc_ofo_gas_tranmiss_other" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_runnumber_ofo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo" (
    "id" SERIAL NOT NULL,
    "event_runnumber_ofo_id" INTEGER,
    "event_doc_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "doc_7_input_date_time_of_the_incident" TEXT,
    "doc_7_input_detail_incident" TEXT,
    "doc_7_input_time_event_start_date" TIMESTAMP(3),
    "doc_7_input_time_event_start_time" TEXT,
    "doc_7_input_time_event_end_date" TIMESTAMP(3),
    "doc_7_input_time_event_end_time" TEXT,
    "doc_7_input_note" TEXT,
    "doc_7_ofo_refer_id" INTEGER,
    "doc_7_input_order_ir_id" INTEGER,
    "doc_7_input_order_io_id" INTEGER,
    "doc_7_input_order_other_id" INTEGER,
    "doc_7_input_order_other_value" TEXT,
    "doc_7_input_order_value" TEXT,
    "doc_8_input_ref_doc_at" TEXT,
    "doc_8_input_date" TIMESTAMP(3),
    "doc_8_input_time" TEXT,
    "doc_8_input_summary" TEXT,
    "doc_8_input_summary_gas" TEXT,
    "doc_8_input_more" TEXT,
    "longdo_dict" TEXT,
    "ref_document" INTEGER,
    "ref_document_in" INTEGER,
    "ref_runnumber_flag" BOOLEAN,
    "version_text" TEXT,
    "seq" INTEGER,
    "event_date" TIMESTAMP(3),
    "event_doc_master_id" INTEGER,
    "event_doc_ofo_type_id" INTEGER,
    "event_doc_ofo_gas_tranmiss_id" INTEGER,
    "event_doc_ofo_gas_tranmiss_other" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_ofo_refer" (
    "id" SERIAL NOT NULL,
    "text" TEXT,

    CONSTRAINT "event_doc_ofo_refer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_ofo_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "name_en" TEXT,
    "color" TEXT,

    CONSTRAINT "event_doc_ofo_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_ofo_gas_tranmiss" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "event_doc_ofo_gas_tranmiss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_action" (
    "id" SERIAL NOT NULL,
    "event_document_ofo_id" INTEGER,
    "event_doc_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "input_note" TEXT,
    "event_doc_master_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_log_history" (
    "id" SERIAL NOT NULL,
    "temp" TEXT,
    "event_document_emer_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_log_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_cc_email" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "event_document_ofo_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_cc_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_email_group_for_event" (
    "id" SERIAL NOT NULL,
    "event_document_ofo_id" INTEGER,
    "edit_email_group_for_event_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "event_document_ofo_email_group_for_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_document_ofo_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_ofo_file_pdf" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "buffer" BYTEA,
    "name" TEXT,
    "event_document_ofo_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_ofo_file_pdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_ofo" (
    "id" SERIAL NOT NULL,
    "ir" INTEGER,
    "io" INTEGER,
    "area_id" INTEGER,
    "nom_point" INTEGER,
    "nom_value_mmscfh" TEXT,
    "gas_command" TEXT,
    "gas_more" TEXT,
    "event_document_ofo_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_ofo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_ofo_match" (
    "id" SERIAL NOT NULL,
    "event_doc_gas_shipper_ofo_id" INTEGER,
    "event_document_ofo_id" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_ofo_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_gas_shipper_ofo_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_doc_gas_shipper_ofo_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_gas_shipper_ofo_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_ofo_order" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "event_doc_ofo_order_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_event_status_id_fkey" FOREIGN KEY ("event_status_id") REFERENCES "public"."event_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_event_doc_ofo_type_id_fkey" FOREIGN KEY ("event_doc_ofo_type_id") REFERENCES "public"."event_doc_ofo_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_event_doc_ofo_gas_tranmiss_id_fkey" FOREIGN KEY ("event_doc_ofo_gas_tranmiss_id") REFERENCES "public"."event_doc_ofo_gas_tranmiss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_ofo" ADD CONSTRAINT "event_runnumber_ofo_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_event_runnumber_ofo_id_fkey" FOREIGN KEY ("event_runnumber_ofo_id") REFERENCES "public"."event_runnumber_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_event_doc_status_id_fkey" FOREIGN KEY ("event_doc_status_id") REFERENCES "public"."event_doc_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_ofo_refer_id_fkey" FOREIGN KEY ("doc_7_ofo_refer_id") REFERENCES "public"."event_doc_ofo_refer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_input_order_ir_id_fkey" FOREIGN KEY ("doc_7_input_order_ir_id") REFERENCES "public"."event_doc_ofo_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_input_order_io_id_fkey" FOREIGN KEY ("doc_7_input_order_io_id") REFERENCES "public"."event_doc_ofo_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_doc_7_input_order_other_id_fkey" FOREIGN KEY ("doc_7_input_order_other_id") REFERENCES "public"."event_doc_ofo_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_event_doc_ofo_type_id_fkey" FOREIGN KEY ("event_doc_ofo_type_id") REFERENCES "public"."event_doc_ofo_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_event_doc_ofo_gas_tranmiss_id_fkey" FOREIGN KEY ("event_doc_ofo_gas_tranmiss_id") REFERENCES "public"."event_doc_ofo_gas_tranmiss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo" ADD CONSTRAINT "event_document_ofo_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_event_doc_status_id_fkey" FOREIGN KEY ("event_doc_status_id") REFERENCES "public"."event_doc_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_action" ADD CONSTRAINT "event_document_ofo_action_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_log_history" ADD CONSTRAINT "event_document_ofo_log_history_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_cc_email" ADD CONSTRAINT "event_document_ofo_cc_email_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_cc_email" ADD CONSTRAINT "event_document_ofo_cc_email_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_cc_email" ADD CONSTRAINT "event_document_ofo_cc_email_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_event_document_of_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_edit_email_group__fkey" FOREIGN KEY ("edit_email_group_for_event_id") REFERENCES "public"."edit_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_email_group_for_event" ADD CONSTRAINT "event_document_ofo_email_group_for_event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file" ADD CONSTRAINT "event_document_ofo_file_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file" ADD CONSTRAINT "event_document_ofo_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file" ADD CONSTRAINT "event_document_ofo_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file_pdf" ADD CONSTRAINT "event_document_ofo_file_pdf_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file_pdf" ADD CONSTRAINT "event_document_ofo_file_pdf_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_ofo_file_pdf" ADD CONSTRAINT "event_document_ofo_file_pdf_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo" ADD CONSTRAINT "event_doc_gas_shipper_ofo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo" ADD CONSTRAINT "event_doc_gas_shipper_ofo_nom_point_fkey" FOREIGN KEY ("nom_point") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo" ADD CONSTRAINT "event_doc_gas_shipper_ofo_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo" ADD CONSTRAINT "event_doc_gas_shipper_ofo_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo" ADD CONSTRAINT "event_doc_gas_shipper_ofo_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo_match" ADD CONSTRAINT "event_doc_gas_shipper_ofo_match_event_doc_gas_shipper_ofo__fkey" FOREIGN KEY ("event_doc_gas_shipper_ofo_id") REFERENCES "public"."event_doc_gas_shipper_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo_match" ADD CONSTRAINT "event_doc_gas_shipper_ofo_match_event_document_ofo_id_fkey" FOREIGN KEY ("event_document_ofo_id") REFERENCES "public"."event_document_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo_file" ADD CONSTRAINT "event_doc_gas_shipper_ofo_file_event_doc_gas_shipper_ofo_i_fkey" FOREIGN KEY ("event_doc_gas_shipper_ofo_id") REFERENCES "public"."event_doc_gas_shipper_ofo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo_file" ADD CONSTRAINT "event_doc_gas_shipper_ofo_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper_ofo_file" ADD CONSTRAINT "event_doc_gas_shipper_ofo_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
