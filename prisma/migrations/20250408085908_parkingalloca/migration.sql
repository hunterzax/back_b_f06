-- CreateTable
CREATE TABLE "public"."park_allocated" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "zone_id" INTEGER,
    "flag_use" BOOLEAN,
    "total_parking_value" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "park_allocated_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."park_allocated" ADD CONSTRAINT "park_allocated_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."park_allocated" ADD CONSTRAINT "park_allocated_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."park_allocated" ADD CONSTRAINT "park_allocated_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
