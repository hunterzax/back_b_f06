-- AlterTable
ALTER TABLE "public"."release_capacity_submission" ADD COLUMN     "group_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
