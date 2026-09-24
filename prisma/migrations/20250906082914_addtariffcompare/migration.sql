-- CreateTable
CREATE TABLE "public"."tariff_compare" (
    "id" SERIAL NOT NULL,
    "tariff_id" INTEGER,
    "compare_with_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_compare_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."tariff_compare" ADD CONSTRAINT "tariff_compare_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_compare" ADD CONSTRAINT "tariff_compare_compare_with_id_fkey" FOREIGN KEY ("compare_with_id") REFERENCES "public"."tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_compare" ADD CONSTRAINT "tariff_compare_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_compare" ADD CONSTRAINT "tariff_compare_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
