-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_row" (
    "id" SERIAL NOT NULL,
    "value" TEXT,
    "entry_exit_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_long" (
    "id" SERIAL NOT NULL,
    "temp_full" TEXT,
    "temp_total_entry" TEXT,
    "temp_total_exit" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_long_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_medium" (
    "id" SERIAL NOT NULL,
    "temp_full" TEXT,
    "temp_total_entry" TEXT,
    "temp_total_exit" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_medium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_short" (
    "id" SERIAL NOT NULL,
    "temp_full" TEXT,
    "temp_total_entry" TEXT,
    "temp_total_exit" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_short_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row" ADD CONSTRAINT "query_shipper_planning_files_temp_row_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row" ADD CONSTRAINT "query_shipper_planning_files_temp_row_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row" ADD CONSTRAINT "query_shipper_planning_files_temp_row_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row" ADD CONSTRAINT "query_shipper_planning_files_temp_row_query_shipper_planni_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long" ADD CONSTRAINT "query_shipper_planning_files_temp_long_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long" ADD CONSTRAINT "query_shipper_planning_files_temp_long_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long" ADD CONSTRAINT "query_shipper_planning_files_temp_long_query_shipper_plann_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_query_shipper_pla_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short" ADD CONSTRAINT "query_shipper_planning_files_temp_short_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short" ADD CONSTRAINT "query_shipper_planning_files_temp_short_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short" ADD CONSTRAINT "query_shipper_planning_files_temp_short_query_shipper_plan_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
