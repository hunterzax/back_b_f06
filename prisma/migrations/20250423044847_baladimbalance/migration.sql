-- CreateTable
CREATE TABLE "public"."balancing_adjustment_daily_imbalance" (
    "id" SERIAL NOT NULL,
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
    "entry_exit_text" TEXT,
    "area_text" TEXT,
    "zone_text" TEXT,
    "adjust_imbalance" TEXT,

    CONSTRAINT "balancing_adjustment_daily_imbalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."balancing_adjust_accumulated_imbalance" (
    "id" SERIAL NOT NULL,
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
    "entry_exit_text" TEXT,
    "area_text" TEXT,
    "zone_text" TEXT,
    "adjust_imbalance" TEXT,

    CONSTRAINT "balancing_adjust_accumulated_imbalance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."balancing_adjustment_daily_imbalance" ADD CONSTRAINT "balancing_adjustment_daily_imbalance_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjustment_daily_imbalance" ADD CONSTRAINT "balancing_adjustment_daily_imbalance_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance" ADD CONSTRAINT "balancing_adjust_accumulated_imbalance_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance" ADD CONSTRAINT "balancing_adjust_accumulated_imbalance_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
