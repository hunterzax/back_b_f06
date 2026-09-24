-- CreateTable
CREATE TABLE "public"."booking_version" (
    "id" SERIAL NOT NULL,
    "vrsion" TEXT,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "booking_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_full_json" (
    "id" SERIAL NOT NULL,
    "data_temp" TEXT,
    "booking_version_id" INTEGER,

    CONSTRAINT "booking_full_json_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_row_json" (
    "id" SERIAL NOT NULL,
    "zone_text" TEXT,
    "area_text" TEXT,
    "data_temp" TEXT,
    "booking_version_id" INTEGER,

    CONSTRAINT "booking_row_json_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_full_json" ADD CONSTRAINT "booking_full_json_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_row_json" ADD CONSTRAINT "booking_row_json_booking_version_id_fkey" FOREIGN KEY ("booking_version_id") REFERENCES "public"."booking_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
