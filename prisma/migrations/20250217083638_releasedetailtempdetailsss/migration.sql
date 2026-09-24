-- AlterTable
ALTER TABLE "public"."release_summary_detail" ADD COLUMN     "path_management_config_id" INTEGER,
ADD COLUMN     "path_management_config_temp" TEXT;

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_path_management_config_id_fkey" FOREIGN KEY ("path_management_config_id") REFERENCES "public"."path_management_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
