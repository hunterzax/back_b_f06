/*
  Warnings:

  - The `month_year_charge` column on the `tariff` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."tariff" DROP COLUMN "month_year_charge",
ADD COLUMN     "month_year_charge" TIMESTAMP(3);
