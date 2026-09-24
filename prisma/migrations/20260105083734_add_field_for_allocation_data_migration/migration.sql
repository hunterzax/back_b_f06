-- AlterTable
ALTER TABLE "public"."allocation_management" ADD COLUMN     "customer_type_text" TEXT,
ADD COLUMN     "intraday_value" TEXT,
ADD COLUMN     "point_type_text" TEXT,
ADD COLUMN     "previous_value" TEXT,
ADD COLUMN     "relation_point_text" TEXT,
ADD COLUMN     "relation_point_type_text" TEXT,
ADD COLUMN     "value" TEXT;
