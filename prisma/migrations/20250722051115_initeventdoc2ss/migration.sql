/*
  Warnings:

  - You are about to drop the column `doc2_input_reason_that_the_gas_is_not_in_the_gas_quality_requir` on the `event_document` table. All the data in the column will be lost.
  - You are about to drop the column `input_reason_that_the_gas_is_not_in_the_gas_quality_requirement` on the `event_document` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."event_document" DROP COLUMN "doc2_input_reason_that_the_gas_is_not_in_the_gas_quality_requir",
DROP COLUMN "input_reason_that_the_gas_is_not_in_the_gas_quality_requirement",
ADD COLUMN     "doc2_input_reason_the_gas_quality_requirements" TEXT,
ADD COLUMN     "input_reason_the_gas_quality_requirements" TEXT;
