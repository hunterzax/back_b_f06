-- CreateTable
CREATE TABLE "public"."mode_zone_base_inventory" (
    "id" SERIAL NOT NULL,
    "zone_id" INTEGER,
    "mode_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "mode_zone_base_inventory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."mode_zone_base_inventory" ADD CONSTRAINT "mode_zone_base_inventory_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mode_zone_base_inventory" ADD CONSTRAINT "mode_zone_base_inventory_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "public"."config_mode_zone_base_inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mode_zone_base_inventory" ADD CONSTRAINT "mode_zone_base_inventory_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mode_zone_base_inventory" ADD CONSTRAINT "mode_zone_base_inventory_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
