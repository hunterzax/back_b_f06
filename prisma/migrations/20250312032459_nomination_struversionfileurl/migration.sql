-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD COLUMN     "nomination_version_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD COLUMN     "nomination_version_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_url" ADD CONSTRAINT "query_shipper_nomination_file_url_nomination_version_id_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "query_shipper_nomination_file_comment_nomination_version_i_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
