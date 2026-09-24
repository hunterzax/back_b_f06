-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files" (
    "id" SERIAL NOT NULL,
    "planning_code" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "term_type_id" INTEGER,
    "group_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "shipper_file_submission_date" TIMESTAMP(3),

    CONSTRAINT "query_shipper_planning_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."newpoint" (
    "id" SERIAL NOT NULL,
    "planning_code" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "term_type_id" INTEGER,
    "group_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "shipper_file_submission_date" TIMESTAMP(3),

    CONSTRAINT "newpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."newpoint_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "newpoint_id" INTEGER,

    CONSTRAINT "newpoint_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."newpoint_detail" (
    "id" SERIAL NOT NULL,
    "point" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "newpoint_id" INTEGER,

    CONSTRAINT "newpoint_detail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files" ADD CONSTRAINT "query_shipper_planning_files_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files" ADD CONSTRAINT "query_shipper_planning_files_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files" ADD CONSTRAINT "query_shipper_planning_files_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files" ADD CONSTRAINT "query_shipper_planning_files_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_file" ADD CONSTRAINT "query_shipper_planning_files_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_file" ADD CONSTRAINT "query_shipper_planning_files_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_file" ADD CONSTRAINT "query_shipper_planning_files_file_query_shipper_planning_f_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint" ADD CONSTRAINT "newpoint_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint" ADD CONSTRAINT "newpoint_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint" ADD CONSTRAINT "newpoint_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint" ADD CONSTRAINT "newpoint_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_file" ADD CONSTRAINT "newpoint_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_file" ADD CONSTRAINT "newpoint_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_file" ADD CONSTRAINT "newpoint_file_newpoint_id_fkey" FOREIGN KEY ("newpoint_id") REFERENCES "public"."newpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_detail" ADD CONSTRAINT "newpoint_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_detail" ADD CONSTRAINT "newpoint_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."newpoint_detail" ADD CONSTRAINT "newpoint_detail_newpoint_id_fkey" FOREIGN KEY ("newpoint_id") REFERENCES "public"."newpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
