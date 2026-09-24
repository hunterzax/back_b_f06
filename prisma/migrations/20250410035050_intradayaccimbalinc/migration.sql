-- CreateTable
CREATE TABLE "public"."intraday_acc_imbalance_inventory" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "gas_hour" INTEGER,
    "zone" TEXT,
    "value" TEXT,
    "del_flag" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "intraday_acc_imbalance_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."intraday_acc_imbalance_inventory_comment" (
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

    CONSTRAINT "intraday_acc_imbalance_inventory_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."intraday_acc_imbalance_inventory" ADD CONSTRAINT "intraday_acc_imbalance_inventory_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_acc_imbalance_inventory" ADD CONSTRAINT "intraday_acc_imbalance_inventory_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_acc_imbalance_inventory_comment" ADD CONSTRAINT "intraday_acc_imbalance_inventory_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_acc_imbalance_inventory_comment" ADD CONSTRAINT "intraday_acc_imbalance_inventory_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
