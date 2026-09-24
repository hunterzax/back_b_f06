-- AlterTable
ALTER TABLE "public"."tariff" ADD COLUMN     "tariff_type_ab_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."tariff_charge" ADD COLUMN     "tariff_type_charge_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."tariff_type_ab" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "tariff_type_ab_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_tariff_type_ab_id_fkey" FOREIGN KEY ("tariff_type_ab_id") REFERENCES "public"."tariff_type_ab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_tariff_type_charge_id_fkey" FOREIGN KEY ("tariff_type_charge_id") REFERENCES "public"."tariff_type_charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
