-- AlterTable
ALTER TABLE "public"."query_shipper_planning_files_temp_row" ADD COLUMN     "temp_area" TEXT,
ADD COLUMN     "temp_customer" TEXT,
ADD COLUMN     "temp_new_point" TEXT,
ADD COLUMN     "temp_nomination_point" TEXT,
ADD COLUMN     "temp_point_type" TEXT,
ADD COLUMN     "temp_unit" TEXT;
