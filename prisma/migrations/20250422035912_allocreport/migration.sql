-- CreateTable
CREATE TABLE "public"."allocation_report" (
    "id" SERIAL NOT NULL,
    "review_code" TEXT,
    "name" TEXT,
    "gas_day" TIMESTAMP(3),
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "shipper_name_text" TEXT,
    "gas_day_text" TEXT,
    "contract_code_text" TEXT,
    "point_text" TEXT,
    "entry_exit_text" TEXT,
    "area_text" TEXT,
    "zone_text" TEXT,

    CONSTRAINT "allocation_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocation_report_view" (
    "id" SERIAL NOT NULL,
    "review_code" TEXT,
    "name" TEXT,
    "gas_day" TIMESTAMP(3),
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "shipper_name_text" TEXT,
    "gas_day_text" TEXT,
    "contract_code_text" TEXT,
    "point_text" TEXT,
    "entry_exit_text" TEXT,
    "area_text" TEXT,
    "zone_text" TEXT,
    "allocation_report_id" INTEGER,

    CONSTRAINT "allocation_report_view_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."allocation_report" ADD CONSTRAINT "allocation_report_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_report" ADD CONSTRAINT "allocation_report_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_report_view" ADD CONSTRAINT "allocation_report_view_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_report_view" ADD CONSTRAINT "allocation_report_view_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_report_view" ADD CONSTRAINT "fk_allocation_status_comment" FOREIGN KEY ("allocation_report_id") REFERENCES "public"."allocation_report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
