-- CreateTable
CREATE TABLE "public"."booking_version_edit_temp" (
    "id" SERIAL NOT NULL,
    "booking_full_json_temp" TEXT,
    "booking_row_json_temp" TEXT,
    "booking_version_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "booking_version_edit_temp_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."booking_version_edit_temp" ADD CONSTRAINT "booking_version_edit_temp_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version_edit_temp" ADD CONSTRAINT "booking_version_edit_temp_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version_edit_temp" ADD CONSTRAINT "booking_version_edit_temp_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
