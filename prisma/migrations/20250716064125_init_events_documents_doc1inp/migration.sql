/*
  Warnings:

  - You are about to drop the column `input_reason_that_the_gas_is_not_in_the_gas_quality_requirement` on the `event_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."event_document" DROP COLUMN "input_reason_that_the_gas_is_not_in_the_gas_quality_requirement",
ADD COLUMN     "input_reason_that_the_gas_is_not_in_the_gas_quality_requirements" TEXT;
