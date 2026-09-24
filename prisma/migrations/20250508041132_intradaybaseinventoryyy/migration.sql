-- CreateTable
CREATE TABLE "public"."intraday_base_inentory" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "gas_hour" TEXT,
    "timestamp" TEXT,
    "zone_text" TEXT,
    "mode" TEXT,
    "hv" TEXT,
    "base_inventory_value" TEXT,
    "high_difficult_day" TEXT,
    "high_red" TEXT,
    "high_orange" TEXT,
    "high_max" TEXT,
    "alert_high" TEXT,
    "alert_low" TEXT,
    "low_orange" TEXT,
    "low_red" TEXT,
    "low_difficult_day" TEXT,
    "low_max" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "intraday_base_inentory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."intraday_base_inentory_import_log" (
    "id" SERIAL NOT NULL,
    "file" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "intraday_base_inentory_import_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."intraday_base_inentory" ADD CONSTRAINT "intraday_base_inentory_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_base_inentory" ADD CONSTRAINT "intraday_base_inentory_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_base_inentory_import_log" ADD CONSTRAINT "intraday_base_inentory_import_log_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_base_inentory_import_log" ADD CONSTRAINT "intraday_base_inentory_import_log_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
