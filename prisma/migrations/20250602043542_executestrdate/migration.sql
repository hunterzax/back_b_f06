/*
  Warnings:

  - You are about to drop the column `end_data` on the `execute_eod` table. All the data in the column will be lost.
  - You are about to drop the column `end_data_date` on the `execute_eod` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."execute_eod" DROP COLUMN "end_data",
DROP COLUMN "end_data_date",
ADD COLUMN     "end_date" TEXT,
ADD COLUMN     "end_date_date" TIMESTAMP(3);
