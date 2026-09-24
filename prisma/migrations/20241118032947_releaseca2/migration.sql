/*
  Warnings:

  - You are about to drop the column `contracted_mmbtu_d` on the `release_capacity_submission_detail` table. All the data in the column will be lost.
  - You are about to drop the column `contracted_mmscfd` on the `release_capacity_submission_detail` table. All the data in the column will be lost.
  - You are about to drop the column `release_mmbtu_d` on the `release_capacity_submission_detail` table. All the data in the column will be lost.
  - You are about to drop the column `release_mmscfd` on the `release_capacity_submission_detail` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."release_capacity_submission_detail" DROP COLUMN "contracted_mmbtu_d",
DROP COLUMN "contracted_mmscfd",
DROP COLUMN "release_mmbtu_d",
DROP COLUMN "release_mmscfd",
ADD COLUMN     "path_management_config_id" INTEGER,
ADD COLUMN     "path_management_config_temp" TEXT,
ADD COLUMN     "total" TEXT;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_path_management_config__fkey" FOREIGN KEY ("path_management_config_id") REFERENCES "public"."path_management_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
