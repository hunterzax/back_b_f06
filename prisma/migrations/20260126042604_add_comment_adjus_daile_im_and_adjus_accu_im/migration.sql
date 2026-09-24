-- CreateTable
CREATE TABLE "public"."balancing_adjustment_daily_imbalance_comment" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "gas_hour" INTEGER,
    "remark" TEXT,
    "del_flag" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "balancing_adjustment_daily_imbalance_id" INTEGER,

    CONSTRAINT "balancing_adjustment_daily_imbalance_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."balancing_adjust_accumulated_imbalance_comment" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "gas_hour" INTEGER,
    "remark" TEXT,
    "del_flag" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "balancing_adjust_accumulated_imbalance_id" INTEGER,

    CONSTRAINT "balancing_adjust_accumulated_imbalance_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."balancing_adjustment_daily_imbalance_comment" ADD CONSTRAINT "balancing_adjustment_daily_imbalance_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjustment_daily_imbalance_comment" ADD CONSTRAINT "balancing_adjustment_daily_imbalance_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjustment_daily_imbalance_comment" ADD CONSTRAINT "fk_balancing_adjustment_daily_imbalance_comment" FOREIGN KEY ("balancing_adjustment_daily_imbalance_id") REFERENCES "public"."balancing_adjustment_daily_imbalance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance_comment" ADD CONSTRAINT "balancing_adjust_accumulated_imbalance_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance_comment" ADD CONSTRAINT "balancing_adjust_accumulated_imbalance_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance_comment" ADD CONSTRAINT "fk_balancing_adjust_accumulated_imbalance_comment" FOREIGN KEY ("balancing_adjust_accumulated_imbalance_id") REFERENCES "public"."balancing_adjust_accumulated_imbalance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
