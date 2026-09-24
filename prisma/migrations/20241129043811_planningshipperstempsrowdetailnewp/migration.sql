-- AlterTable
ALTER TABLE "public"."newpoint" ADD COLUMN     "query_shipper_planning_files_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."newpoint" ADD CONSTRAINT "newpoint_query_shipper_planning_files_id_fkey" FOREIGN KEY ("query_shipper_planning_files_id") REFERENCES "public"."query_shipper_planning_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
