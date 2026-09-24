-- CreateTable
CREATE TABLE "public"."metered_retrieving" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "metered_run_number_id" INTEGER,
    "temp" TEXT,
    "type" TEXT,
    "description" TEXT,
    "timestamp" TIMESTAMP(3),

    CONSTRAINT "metered_retrieving_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."metered_retrieving" ADD CONSTRAINT "metered_retrieving_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metered_retrieving" ADD CONSTRAINT "metered_retrieving_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metered_retrieving" ADD CONSTRAINT "metered_retrieving_metered_run_number_id_fkey" FOREIGN KEY ("metered_run_number_id") REFERENCES "public"."metered_run_number"("id") ON DELETE SET NULL ON UPDATE CASCADE;
