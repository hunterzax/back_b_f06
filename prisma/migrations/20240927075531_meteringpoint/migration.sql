-- CreateTable
CREATE TABLE "public"."point_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "point_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."metering_point" (
    "id" SERIAL NOT NULL,
    "metered_id" TEXT,
    "metered_point_name" TEXT,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "point_type_id" INTEGER,
    "entry_exit_id" INTEGER,
    "zone_id" INTEGER,
    "area_id" INTEGER,
    "non_tpa_point_id" INTEGER,
    "nomination_point_id" INTEGER,

    CONSTRAINT "metering_point_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_point_type_id_fkey" FOREIGN KEY ("point_type_id") REFERENCES "public"."point_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_non_tpa_point_id_fkey" FOREIGN KEY ("non_tpa_point_id") REFERENCES "public"."non_tpa_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metering_point" ADD CONSTRAINT "metering_point_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
