/*
  Warnings:

  - You are about to drop the column `approve_time` on the `release_capacity_submission` table. All the data in the column will be lost.
  - You are about to drop the column `reasons` on the `release_capacity_submission` table. All the data in the column will be lost.
  - You are about to drop the column `reject_time` on the `release_capacity_submission` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."release_capacity_submission" DROP COLUMN "approve_time",
DROP COLUMN "reasons",
DROP COLUMN "reject_time";

-- CreateTable
CREATE TABLE "public"."release_capacity_active" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "release_capacity_submission_id" INTEGER,
    "release_capacity_status_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "reasons" TEXT,

    CONSTRAINT "release_capacity_active_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_capacity_active" ADD CONSTRAINT "release_capacity_active_release_capacity_submission_id_fkey" FOREIGN KEY ("release_capacity_submission_id") REFERENCES "public"."release_capacity_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_active" ADD CONSTRAINT "release_capacity_active_release_capacity_status_id_fkey" FOREIGN KEY ("release_capacity_status_id") REFERENCES "public"."release_capacity_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_active" ADD CONSTRAINT "release_capacity_active_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_active" ADD CONSTRAINT "release_capacity_active_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
