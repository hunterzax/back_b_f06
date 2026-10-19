-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_row_low" (
    "id" SERIAL NOT NULL,
    "value" TEXT,
    "temp_new_point" TEXT,
    "temp_point_type" TEXT,
    "temp_nomination_point" TEXT,
    "temp_customer" TEXT,
    "temp_area" TEXT,
    "temp_unit" TEXT,
    "entry_exit_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_row_low_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_row_high" (
    "id" SERIAL NOT NULL,
    "value" TEXT,
    "temp_new_point" TEXT,
    "temp_point_type" TEXT,
    "temp_nomination_point" TEXT,
    "temp_customer" TEXT,
    "temp_area" TEXT,
    "temp_unit" TEXT,
    "entry_exit_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "query_shipper_planning_files_id" INTEGER,

    CONSTRAINT "query_shipper_planning_files_temp_row_high_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_long_low" (
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

    CONSTRAINT "query_shipper_planning_files_temp_long_low_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_long_high" (
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

    CONSTRAINT "query_shipper_planning_files_temp_long_high_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_medium_low" (
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

    CONSTRAINT "query_shipper_planning_files_temp_medium_low_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_medium_high" (
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

    CONSTRAINT "query_shipper_planning_files_temp_medium_high_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_short_low" (
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

    CONSTRAINT "query_shipper_planning_files_temp_short_low_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_shipper_planning_files_temp_short_high" (
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

    CONSTRAINT "query_shipper_planning_files_temp_short_high_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_low" ADD CONSTRAINT "query_shipper_planning_files_temp_row_low_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_low" ADD CONSTRAINT "query_shipper_planning_files_temp_row_low_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_low" ADD CONSTRAINT "query_shipper_planning_files_temp_row_low_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_low" ADD CONSTRAINT "query_shipper_planning_files_temp_row_low_query_shipper_pl_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_high" ADD CONSTRAINT "query_shipper_planning_files_temp_row_high_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_high" ADD CONSTRAINT "query_shipper_planning_files_temp_row_high_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_high" ADD CONSTRAINT "query_shipper_planning_files_temp_row_high_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_row_high" ADD CONSTRAINT "query_shipper_planning_files_temp_row_high_query_shipper_p_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_low" ADD CONSTRAINT "query_shipper_planning_files_temp_long_low_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_low" ADD CONSTRAINT "query_shipper_planning_files_temp_long_low_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_low" ADD CONSTRAINT "query_shipper_planning_files_temp_long_low_query_shipper_p_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_high" ADD CONSTRAINT "query_shipper_planning_files_temp_long_high_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_high" ADD CONSTRAINT "query_shipper_planning_files_temp_long_high_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_long_high" ADD CONSTRAINT "query_shipper_planning_files_temp_long_high_query_shipper__fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_low" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_low_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_low" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_low_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_low" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_low_query_shipper_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_high" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_high_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_high" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_high_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_medium_high" ADD CONSTRAINT "query_shipper_planning_files_temp_medium_high_query_shippe_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_low" ADD CONSTRAINT "query_shipper_planning_files_temp_short_low_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_low" ADD CONSTRAINT "query_shipper_planning_files_temp_short_low_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_low" ADD CONSTRAINT "query_shipper_planning_files_temp_short_low_query_shipper__fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_high" ADD CONSTRAINT "query_shipper_planning_files_temp_short_high_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_high" ADD CONSTRAINT "query_shipper_planning_files_temp_short_high_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_planning_files_temp_short_high" ADD CONSTRAINT "query_shipper_planning_files_temp_short_high_query_shipper_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
