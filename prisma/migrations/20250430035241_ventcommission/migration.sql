-- CreateTable
CREATE TABLE "public"."vent_commissioning_other_gas" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "group_id" INTEGER,
    "zone_id" INTEGER,
    "vent_gas_value_mmbtud" TEXT,
    "commissioning_gas_value_mmbtud" TEXT,
    "other_gas_value_mmbtud" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "vent_commissioning_other_gas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vent_commissioning_other_gas_remark" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "vent_commissioning_other_gas_id" INTEGER,

    CONSTRAINT "vent_commissioning_other_gas_remark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vent_commissioning_other_gas_import_log" (
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

    CONSTRAINT "vent_commissioning_other_gas_import_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas" ADD CONSTRAINT "vent_commissioning_other_gas_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas" ADD CONSTRAINT "vent_commissioning_other_gas_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas" ADD CONSTRAINT "vent_commissioning_other_gas_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas" ADD CONSTRAINT "vent_commissioning_other_gas_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas_remark" ADD CONSTRAINT "vent_commissioning_other_gas_remark_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas_remark" ADD CONSTRAINT "vent_commissioning_other_gas_remark_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas_remark" ADD CONSTRAINT "vent_commissioning_other_gas_remark_vent_commissioning_oth_fkey" FOREIGN KEY ("vent_commissioning_other_gas_id") REFERENCES "public"."vent_commissioning_other_gas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas_import_log" ADD CONSTRAINT "vent_commissioning_other_gas_import_log_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vent_commissioning_other_gas_import_log" ADD CONSTRAINT "vent_commissioning_other_gas_import_log_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
