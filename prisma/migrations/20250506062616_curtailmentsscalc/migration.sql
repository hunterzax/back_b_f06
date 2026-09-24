/*
  Warnings:

  - You are about to drop the column `area_text` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `calc_hv` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `contract` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `gas_day` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `gas_day_text` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `max_capacity` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `nomination_value` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `remainingCapacity` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `shipper_name` on the `curtailments_allocation_type` table. All the data in the column will be lost.
  - You are about to drop the column `term` on the `curtailments_allocation_type` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."curtailments_allocation_type" DROP COLUMN "area_text",
DROP COLUMN "calc_hv",
DROP COLUMN "contract",
DROP COLUMN "gas_day",
DROP COLUMN "gas_day_text",
DROP COLUMN "max_capacity",
DROP COLUMN "nomination_value",
DROP COLUMN "remainingCapacity",
DROP COLUMN "shipper_name",
DROP COLUMN "term",
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "public"."curtailments_allocation_calc" (
    "id" SERIAL NOT NULL,
    "gas_day" TIMESTAMP(3),
    "gas_day_text" TEXT,
    "calc_hv" INTEGER,
    "nomination_value" INTEGER,
    "max_capacity" INTEGER,
    "term" TEXT,
    "shipper_name" TEXT,
    "contract" TEXT,
    "area_text" TEXT,
    "remainingCapacity" INTEGER,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "curtailments_allocation_id" INTEGER,

    CONSTRAINT "curtailments_allocation_calc_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation_calc" ADD CONSTRAINT "curtailments_allocation_calc_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation_calc" ADD CONSTRAINT "curtailments_allocation_calc_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."curtailments_allocation_calc" ADD CONSTRAINT "curtailments_allocation_calc_curtailments_allocation_id_fkey" FOREIGN KEY ("curtailments_allocation_id") REFERENCES "public"."curtailments_allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
