-- CreateTable
CREATE TABLE "public"."allocation_shipper_report_approved" (
    "id" SERIAL NOT NULL,
    "gas_day_from" TEXT,
    "gas_day_from_d" TIMESTAMP(3),
    "gas_day_to" TEXT,
    "gas_day_to_d" TIMESTAMP(3),
    "file" TEXT,
    "jsonData" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "allocation_shipper_report_approved_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."allocation_shipper_report_approved" ADD CONSTRAINT "allocation_shipper_report_approved_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_shipper_report_approved" ADD CONSTRAINT "allocation_shipper_report_approved_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
