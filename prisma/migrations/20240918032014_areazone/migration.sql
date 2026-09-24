-- CreateTable
CREATE TABLE "public"."entry_exit" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "entry_exit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."zone" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."zone_master" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "zone_id" INTEGER,
    "entry_exit_id" INTEGER,

    CONSTRAINT "zone_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."zone_master_quality" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "c1_min" DOUBLE PRECISION,
    "c1_max" DOUBLE PRECISION,
    "c3_min" DOUBLE PRECISION,
    "c3_max" DOUBLE PRECISION,
    "k5_min" DOUBLE PRECISION,
    "k5_max" DOUBLE PRECISION,
    "c7_min" DOUBLE PRECISION,
    "c7_max" DOUBLE PRECISION,
    "oxygen_min" DOUBLE PRECISION,
    "oxygen_max" DOUBLE PRECISION,
    "mercury_min" DOUBLE PRECISION,
    "mercury_max" DOUBLE PRECISION,
    "wobbe_index_min" DOUBLE PRECISION,
    "wobbe_index_max" DOUBLE PRECISION,
    "c2_min" DOUBLE PRECISION,
    "c2_max" DOUBLE PRECISION,
    "ic4_min" DOUBLE PRECISION,
    "ic4_max" DOUBLE PRECISION,
    "nc5_min" DOUBLE PRECISION,
    "nc5_max" DOUBLE PRECISION,
    "carbon_dioxide_min" DOUBLE PRECISION,
    "carbon_dioxide_max" DOUBLE PRECISION,
    "dew_point_min" DOUBLE PRECISION,
    "dew_point_max" DOUBLE PRECISION,
    "hydrogen_suifide_min" DOUBLE PRECISION,
    "hydrogen_suifide_max" DOUBLE PRECISION,
    "sg_min" DOUBLE PRECISION,
    "sg_max" DOUBLE PRECISION,
    "c2_plus_min" DOUBLE PRECISION,
    "c2_plus_max" DOUBLE PRECISION,
    "nc4_min" DOUBLE PRECISION,
    "nc4_max" DOUBLE PRECISION,
    "c6_min" DOUBLE PRECISION,
    "c6_max" DOUBLE PRECISION,
    "nitrogen_min" DOUBLE PRECISION,
    "nitrogen_max" DOUBLE PRECISION,
    "moisture_min" DOUBLE PRECISION,
    "moisture_max" DOUBLE PRECISION,
    "total_sulphur_min" DOUBLE PRECISION,
    "total_sulphur_max" DOUBLE PRECISION,

    CONSTRAINT "zone_master_quality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."area" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "description" TEXT,
    "area_nominal_capacity" INTEGER,
    "supply_reference_quality_area" INTEGER,
    "zone_id" INTEGER,
    "entry_exit_id" INTEGER,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."entry_exit" ADD CONSTRAINT "entry_exit_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entry_exit" ADD CONSTRAINT "entry_exit_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone" ADD CONSTRAINT "zone_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone" ADD CONSTRAINT "zone_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master" ADD CONSTRAINT "zone_master_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master" ADD CONSTRAINT "zone_master_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master" ADD CONSTRAINT "zone_master_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master" ADD CONSTRAINT "zone_master_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master_quality" ADD CONSTRAINT "zone_master_quality_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zone_master_quality" ADD CONSTRAINT "zone_master_quality_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area" ADD CONSTRAINT "area_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area" ADD CONSTRAINT "area_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area" ADD CONSTRAINT "area_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area" ADD CONSTRAINT "area_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
