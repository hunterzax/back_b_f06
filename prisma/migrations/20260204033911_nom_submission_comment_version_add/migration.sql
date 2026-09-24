-- AlterTable
ALTER TABLE "public"."submission_comment_query_shipper_nomination_file" ADD COLUMN     "nomination_version_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_query_shipper_nomination_file" ADD CONSTRAINT "submission_comment_query_shipper_nomination_file_nominatio_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
