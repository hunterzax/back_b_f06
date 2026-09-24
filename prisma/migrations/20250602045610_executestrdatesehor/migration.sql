/*
  Warnings:

  - The `gas_hour` column on the `execute_intraday` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."execute_intraday" DROP COLUMN "gas_hour",
ADD COLUMN     "gas_hour" INTEGER;
