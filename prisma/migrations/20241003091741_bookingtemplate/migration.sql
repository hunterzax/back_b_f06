-- CreateTable
CREATE TABLE "public"."booking_template" (
    "id" SERIAL NOT NULL,
    "file_period" INTEGER,
    "file_period_mode" INTEGER,
    "file_start_date_mode" INTEGER,
    "fixdayday" INTEGER,
    "todayday" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "booking_template_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."booking_template" ADD CONSTRAINT "booking_template_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_template" ADD CONSTRAINT "booking_template_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
