-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_file" (
    "id" SERIAL NOT NULL,
    "nomination_code" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "nomination_type_id" INTEGER,
    "gas_day" TIMESTAMP(3),
    "query_shipper_nomination_status_id" INTEGER,
    "contract_code_id" INTEGER,
    "group_id" INTEGER,
    "file_name" TEXT,
    "query_shipper_nomination_file_renom_id" INTEGER,
    "submitted_timestamp" TIMESTAMP(3),

    CONSTRAINT "query_shipper_nomination_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nomination_version" (
    "id" SERIAL NOT NULL,
    "version" TEXT,
    "query_shipper_nomination_file_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,

    CONSTRAINT "nomination_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nomination_full_json" (
    "id" SERIAL NOT NULL,
    "data_temp" TEXT,
    "nomination_version_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,

    CONSTRAINT "nomination_full_json_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nomination_row_json" (
    "id" SERIAL NOT NULL,
    "zone_text" TEXT,
    "area_text" TEXT,
    "data_temp" TEXT,
    "old_index" INTEGER,
    "nomination_version_id" INTEGER,
    "entry_exit_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,
    "query_shipper_nomination_type_id" INTEGER,

    CONSTRAINT "nomination_row_json_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "query_shipper_nomination_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_file_url" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "query_shipper_nomination_file_id" INTEGER,
    "query_shipper_nomination_status_id" INTEGER,

    CONSTRAINT "query_shipper_nomination_file_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_file_comment" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "query_shipper_nomination_file_id" INTEGER,
    "query_shipper_nomination_status_id" INTEGER,

    CONSTRAINT "query_shipper_nomination_file_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "query_shipper_nomination_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submission_comment_query_shipper_nomination_file" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "query_shipper_nomination_file_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "submission_comment_query_shipper_nomination_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_file_renom" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "query_shipper_nomination_file_renom_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_nomination_type_id_fkey" FOREIGN KEY ("nomination_type_id") REFERENCES "public"."nomination_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_query_shipper_nomination_sta_fkey" FOREIGN KEY ("query_shipper_nomination_status_id") REFERENCES "public"."query_shipper_nomination_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_query_shipper_nomination_fil_fkey" FOREIGN KEY ("query_shipper_nomination_file_renom_id") REFERENCES "public"."query_shipper_nomination_file_renom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_version" ADD CONSTRAINT "nomination_version_query_shipper_nomination_file_id_fkey" FOREIGN KEY ("query_shipper_nomination_file_id") REFERENCES "public"."query_shipper_nomination_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_version" ADD CONSTRAINT "nomination_version_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_version" ADD CONSTRAINT "nomination_version_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json" ADD CONSTRAINT "nomination_full_json_nomination_version_id_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json" ADD CONSTRAINT "nomination_full_json_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json" ADD CONSTRAINT "nomination_full_json_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_row_json" ADD CONSTRAINT "nomination_row_json_nomination_version_id_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_row_json" ADD CONSTRAINT "nomination_row_json_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_row_json" ADD CONSTRAINT "nomination_row_json_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_row_json" ADD CONSTRAINT "nomination_row_json_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_row_json" ADD CONSTRAINT "nomination_row_json_query_shipper_nomination_type_id_fkey" FOREIGN KEY ("query_shipper_nomination_type_id") REFERENCES "public"."query_shipper_nomination_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD CONSTRAINT "query_shipper_nomination_file_url_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD CONSTRAINT "query_shipper_nomination_file_url_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD CONSTRAINT "fk_query_shipper_nomination_file_url" FOREIGN KEY ("query_shipper_nomination_file_id") REFERENCES "public"."query_shipper_nomination_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD CONSTRAINT "fk_query_shipper_nomination_status_url" FOREIGN KEY ("query_shipper_nomination_status_id") REFERENCES "public"."query_shipper_nomination_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "query_shipper_nomination_file_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "query_shipper_nomination_file_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "fk_query_shipper_nomination_file_comment" FOREIGN KEY ("query_shipper_nomination_file_id") REFERENCES "public"."query_shipper_nomination_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "fk_query_shipper_nomination_status_comment" FOREIGN KEY ("query_shipper_nomination_status_id") REFERENCES "public"."query_shipper_nomination_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_query_shipper_nomination_file" ADD CONSTRAINT "submission_comment_query_shipper_nomination_file_query_shi_fkey" FOREIGN KEY ("query_shipper_nomination_file_id") REFERENCES "public"."query_shipper_nomination_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_query_shipper_nomination_file" ADD CONSTRAINT "submission_comment_query_shipper_nomination_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_query_shipper_nomination_file" ADD CONSTRAINT "submission_comment_query_shipper_nomination_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
