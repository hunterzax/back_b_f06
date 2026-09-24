-- CreateTable
CREATE TABLE "public"."curtailments_allocation" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "area" TEXT,
    "nomination_point" TEXT,
    "unit" TEXT,
    "max_capacity" TEXT,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "curtailments_allocation_type_id" INTEGER,

    CONSTRAINT "curtailments_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."curtailments_allocation_type" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "calc_hv" INTEGER,
    "nomination_value" INTEGER,
    "max_capacity" INTEGER,
    "term" TEXT,
    "shipper_name" TEXT,
    "contract" TEXT,
    "area_text" TEXT,
    "remainingCapacity" INTEGER,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "curtailments_allocation_type_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation" ADD CONSTRAINT "curtailments_allocation_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation" ADD CONSTRAINT "curtailments_allocation_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation" ADD CONSTRAINT "curtailments_allocation_curtailments_allocation_type_id_fkey" FOREIGN KEY ("curtailments_allocation_type_id") REFERENCES "public"."curtailments_allocation_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation_type" ADD CONSTRAINT "curtailments_allocation_type_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation_type" ADD CONSTRAINT "curtailments_allocation_type_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
