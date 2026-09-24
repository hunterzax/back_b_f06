/*
  Warnings:

  - You are about to drop the column `start_data` on the `execute_eod` table. All the data in the column will be lost.
  - You are about to drop the column `start_data_date` on the `execute_eod` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."execute_eod" DROP COLUMN "start_data",
DROP COLUMN "start_data_date",
ADD COLUMN     "start_date" TEXT,
ADD COLUMN     "start_date_date" TIMESTAMP(3);
