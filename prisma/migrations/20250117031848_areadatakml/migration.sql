-- CreateTable
CREATE TABLE "public"."area_data_kml_full" (
    "id" SERIAL NOT NULL,
    "temps" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "area_data_kml_full_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."area_data_kml_row" (
    "id" SERIAL NOT NULL,
    "original_by_document" TEXT,
    "original_id" TEXT,
    "original_name" TEXT,
    "original_icon" TEXT,
    "original_url" TEXT,
    "original_lat_lon_box" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "area_data_kml_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."area_data_kml_full" ADD CONSTRAINT "area_data_kml_full_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area_data_kml_full" ADD CONSTRAINT "area_data_kml_full_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area_data_kml_row" ADD CONSTRAINT "area_data_kml_row_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."area_data_kml_row" ADD CONSTRAINT "area_data_kml_row_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
