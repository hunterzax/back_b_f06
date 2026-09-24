-- CreateTable
CREATE TABLE "public"."event_runnumber_emer" (
    "id" SERIAL NOT NULL,
    "event_nember" TEXT,
    "event_date" TIMESTAMP(3),
    "event_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_runnumber_emer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer" (
    "id" SERIAL NOT NULL,
    "event_runnumber_emer_id" INTEGER,
    "event_doc_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "doc_39_input_date_time_of_the_incident" TEXT,
    "doc_39_input_incident" TEXT,
    "doc_39_input_detail_incident" TEXT,
    "doc_39_input_expected_day_time" TEXT,
    "doc_39_input_shipper_operation" TEXT,
    "doc_39_input_shipper_note" TEXT,
    "longdo_dict" TEXT,
    "ref_document" INTEGER,
    "ref_document_in" INTEGER,
    "ref_runnumber_flag" BOOLEAN,
    "version_text" TEXT,
    "seq" INTEGER,
    "event_date" TIMESTAMP(3),
    "event_doc_master_id" INTEGER,
    "event_doc_emer_type_id" INTEGER,
    "event_doc_emer_gas_tranmiss_id" INTEGER,
    "event_doc_emer_gas_tranmiss_other" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_emer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_emer_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "event_doc_emer_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_emer_gas_tranmiss" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "event_doc_emer_gas_tranmiss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "event_document_emer_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_emer_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_file_pdf" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "buffer" BYTEA,
    "name" TEXT,
    "event_document_emer_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_emer_file_pdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_action" (
    "id" SERIAL NOT NULL,
    "event_document_emer_id" INTEGER,
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

    CONSTRAINT "event_document_emer_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_log_history" (
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

    CONSTRAINT "event_document_emer_log_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_cc_email" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "event_document_emer_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_emer_cc_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document_emer_email_group_for_event" (
    "id" SERIAL NOT NULL,
    "event_document_emer_id" INTEGER,
    "edit_emer_email_group_for_event_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "event_document_emer_email_group_for_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."edit_emer_email_group_for_event" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "user_type_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "edit_emer_email_group_for_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."edit_emer_email_group_for_event_match" (
    "id" SERIAL NOT NULL,
    "edit_emer_email_group_for_event_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "email" TEXT,

    CONSTRAINT "edit_emer_email_group_for_event_match_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_event_status_id_fkey" FOREIGN KEY ("event_status_id") REFERENCES "public"."event_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber_emer" ADD CONSTRAINT "event_runnumber_emer_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_event_runnumber_emer_id_fkey" FOREIGN KEY ("event_runnumber_emer_id") REFERENCES "public"."event_runnumber_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_event_doc_status_id_fkey" FOREIGN KEY ("event_doc_status_id") REFERENCES "public"."event_doc_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_event_doc_emer_type_id_fkey" FOREIGN KEY ("event_doc_emer_type_id") REFERENCES "public"."event_doc_emer_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_event_doc_emer_gas_tranmiss_id_fkey" FOREIGN KEY ("event_doc_emer_gas_tranmiss_id") REFERENCES "public"."event_doc_emer_gas_tranmiss"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer" ADD CONSTRAINT "event_document_emer_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file" ADD CONSTRAINT "event_document_emer_file_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file" ADD CONSTRAINT "event_document_emer_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file" ADD CONSTRAINT "event_document_emer_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file_pdf" ADD CONSTRAINT "event_document_emer_file_pdf_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file_pdf" ADD CONSTRAINT "event_document_emer_file_pdf_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_file_pdf" ADD CONSTRAINT "event_document_emer_file_pdf_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_event_doc_status_id_fkey" FOREIGN KEY ("event_doc_status_id") REFERENCES "public"."event_doc_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_action" ADD CONSTRAINT "event_document_emer_action_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_log_history" ADD CONSTRAINT "event_document_emer_log_history_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_log_history" ADD CONSTRAINT "event_document_emer_log_history_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_log_history" ADD CONSTRAINT "event_document_emer_log_history_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_log_history" ADD CONSTRAINT "event_document_emer_log_history_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_log_history" ADD CONSTRAINT "event_document_emer_log_history_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_cc_email" ADD CONSTRAINT "event_document_emer_cc_email_event_document_emer_id_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_cc_email" ADD CONSTRAINT "event_document_emer_cc_email_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_cc_email" ADD CONSTRAINT "event_document_emer_cc_email_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_event_document_e_fkey" FOREIGN KEY ("event_document_emer_id") REFERENCES "public"."event_document_emer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_edit_emer_email__fkey" FOREIGN KEY ("edit_emer_email_group_for_event_id") REFERENCES "public"."edit_emer_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" ADD CONSTRAINT "edit_emer_email_group_for_event_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" ADD CONSTRAINT "edit_emer_email_group_for_event_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" ADD CONSTRAINT "edit_emer_email_group_for_event_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" ADD CONSTRAINT "edit_emer_email_group_for_event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" ADD CONSTRAINT "edit_emer_email_group_for_event_match_edit_emer_email_grou_fkey" FOREIGN KEY ("edit_emer_email_group_for_event_id") REFERENCES "public"."edit_emer_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" ADD CONSTRAINT "edit_emer_email_group_for_event_match_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" ADD CONSTRAINT "edit_emer_email_group_for_event_match_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
