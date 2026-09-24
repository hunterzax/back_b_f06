/*
  Warnings:

  - You are about to drop the column `release_capacity_submission_file_id` on the `release_capacity_submission` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."release_capacity_submission" DROP CONSTRAINT "release_capacity_submission_release_capacity_submission_fi_fkey";

-- AlterTable
ALTER TABLE "public"."release_capacity_submission" DROP COLUMN "release_capacity_submission_file_id";

-- AlterTable
ALTER TABLE "public"."release_capacity_submission_file" ADD COLUMN     "release_capacity_submission_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file" ADD CONSTRAINT "release_capacity_submission_file_release_capacity_submissi_fkey" FOREIGN KEY ("release_capacity_submission_id") REFERENCES "public"."release_capacity_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
