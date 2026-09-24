-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file" ADD COLUMN     "entry_quality" BOOLEAN,
ADD COLUMN     "over_maximum_hour_capacity_right" BOOLEAN,
ADD COLUMN     "overuse_quantity" BOOLEAN;
