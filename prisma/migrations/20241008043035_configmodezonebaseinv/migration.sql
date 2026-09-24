-- CreateTable
CREATE TABLE "public"."config_mode_zone_base_inventory" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER,
    "mode" TEXT,
    "high_difficult_day" DOUBLE PRECISION,
    "to_high_difficult_day" DOUBLE PRECISION,
    "high_red" DOUBLE PRECISION,
    "to_high_red" DOUBLE PRECISION,
    "high_orange" DOUBLE PRECISION,
    "to_high_orange" DOUBLE PRECISION,
    "alert_high" DOUBLE PRECISION,
    "to_alert_high" DOUBLE PRECISION,
    "low_orange" DOUBLE PRECISION,
    "to_low_orange" DOUBLE PRECISION,
    "low_red" DOUBLE PRECISION,
    "to_low_red" DOUBLE PRECISION,
    "low_difficult_day" DOUBLE PRECISION,
    "to_low_difficult_day" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "config_mode_zone_base_inventory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."config_mode_zone_base_inventory" ADD CONSTRAINT "config_mode_zone_base_inventory_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."config_mode_zone_base_inventory" ADD CONSTRAINT "config_mode_zone_base_inventory_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."config_mode_zone_base_inventory" ADD CONSTRAINT "config_mode_zone_base_inventory_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
