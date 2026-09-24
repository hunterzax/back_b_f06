-- CreateTable
CREATE TABLE "public"."metered_run_number" (
    "id" SERIAL NOT NULL,
    "metering_retrieving_id" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "metered_run_number_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."metered_run_number" ADD CONSTRAINT "metered_run_number_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metered_run_number" ADD CONSTRAINT "metered_run_number_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
