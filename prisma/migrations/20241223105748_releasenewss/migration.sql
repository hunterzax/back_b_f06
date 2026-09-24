-- CreateTable
CREATE TABLE "public"."booking_full_json_release" (
    "id" SERIAL NOT NULL,
    "data_temp" TEXT,
    "booking_version_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,

    CONSTRAINT "booking_full_json_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_row_json_release" (
    "id" SERIAL NOT NULL,
    "zone_text" TEXT,
    "area_text" TEXT,
    "data_temp" TEXT,
    "booking_version_id" INTEGER,
    "entry_exit_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,
    "contract_point" TEXT,

    CONSTRAINT "booking_row_json_release_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."booking_full_json_release" ADD CONSTRAINT "booking_full_json_release_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_full_json_release" ADD CONSTRAINT "booking_full_json_release_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_full_json_release" ADD CONSTRAINT "booking_full_json_release_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json_release" ADD CONSTRAINT "booking_row_json_release_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json_release" ADD CONSTRAINT "booking_row_json_release_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json_release" ADD CONSTRAINT "booking_row_json_release_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json_release" ADD CONSTRAINT "booking_row_json_release_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
