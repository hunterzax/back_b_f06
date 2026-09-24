-- CreateTable
CREATE TABLE "public"."capacity_detail" (
    "id" SERIAL NOT NULL,
    "mode_temp" TEXT,
    "contract_code_id" INTEGER,
    "booking_version_id" INTEGER,
    "flag_use" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."capacity_detail_point" (
    "id" SERIAL NOT NULL,
    "temp" TEXT,
    "path_temp" TEXT,
    "capacity_detail_id" INTEGER,
    "area_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_detail_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."capacity_detail_point_date" (
    "id" SERIAL NOT NULL,
    "capacity_detail_point_id" INTEGER,
    "area_id" INTEGER,
    "area_nominal_capacity" TEXT,
    "value" TEXT,
    "cals" TEXT,
    "adjust" TEXT,
    "adjust_type" TEXT,
    "ckCompare" BOOLEAN,
    "period" INTEGER,
    "date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_detail_point_date_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."capacity_detail" ADD CONSTRAINT "capacity_detail_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail" ADD CONSTRAINT "capacity_detail_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail" ADD CONSTRAINT "capacity_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail" ADD CONSTRAINT "capacity_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point" ADD CONSTRAINT "capacity_detail_point_capacity_detail_id_fkey" FOREIGN KEY ("capacity_detail_id") REFERENCES "public"."capacity_detail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point" ADD CONSTRAINT "capacity_detail_point_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point" ADD CONSTRAINT "capacity_detail_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point" ADD CONSTRAINT "capacity_detail_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point_date" ADD CONSTRAINT "capacity_detail_point_date_capacity_detail_point_id_fkey" FOREIGN KEY ("capacity_detail_point_id") REFERENCES "public"."capacity_detail_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point_date" ADD CONSTRAINT "capacity_detail_point_date_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point_date" ADD CONSTRAINT "capacity_detail_point_date_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_detail_point_date" ADD CONSTRAINT "capacity_detail_point_date_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
