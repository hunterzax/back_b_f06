-- CreateTable
CREATE TABLE "public"."operation_flow_and_instructed_flow" (
    "id" SERIAL NOT NULL,
    "execute_timestamp" INTEGER,
    "gas_day" TEXT,
    "gas_day_date" TIMESTAMP(3),
    "gas_hour" INTEGER,
    "shipper" TEXT,
    "zone" TEXT,
    "accImb_or_accImbInv" TEXT,
    "accMargin" TEXT,
    "level" TEXT,
    "energyAdjust" TEXT,
    "energyAdjustRate_mmbtuh" TEXT,
    "energyAdjustRate_mmbtud" TEXT,
    "volumeAdjust" TEXT,
    "volumeAdjustRate_mmscfh" TEXT,
    "volumeAdjustRate_mmscfd" TEXT,
    "resolveHour" TEXT,
    "heatingValue" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "operation_flow_and_instructed_flow_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow" ADD CONSTRAINT "operation_flow_and_instructed_flow_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow" ADD CONSTRAINT "operation_flow_and_instructed_flow_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
