/*
  Warnings:

  - You are about to drop the column `nomination_point_id` on the `planning_file_submission_template` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."planning_file_submission_template" DROP CONSTRAINT "planning_file_submission_template_nomination_point_id_fkey";

-- AlterTable
ALTER TABLE "public"."planning_file_submission_template" DROP COLUMN "nomination_point_id";

-- CreateTable
CREATE TABLE "public"."planning_file_submission_template_nom" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "planning_file_submission_template_id" INTEGER,
    "nomination_point_id" INTEGER,

    CONSTRAINT "planning_file_submission_template_nom_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template_nom" ADD CONSTRAINT "planning_file_submission_template_nom_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template_nom" ADD CONSTRAINT "planning_file_submission_template_nom_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template_nom" ADD CONSTRAINT "planning_file_submission_template_nom_planning_file_submis_fkey" FOREIGN KEY ("planning_file_submission_template_id") REFERENCES "public"."planning_file_submission_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template_nom" ADD CONSTRAINT "planning_file_submission_template_nom_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
