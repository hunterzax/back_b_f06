/*
  Warnings:

  - You are about to drop the column `url` on the `query_shipper_nomination_file_comment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file_comment" DROP COLUMN "url",
ADD COLUMN     "remark" TEXT;
