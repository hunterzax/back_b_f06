/*
  Warnings:

  - You are about to drop the column `url` on the `upload_template_for_shipper_comment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."upload_template_for_shipper_comment" DROP COLUMN "url",
ADD COLUMN     "comment" TEXT;
