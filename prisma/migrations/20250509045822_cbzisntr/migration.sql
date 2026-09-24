-- AlterTable
ALTER TABLE "public"."config_mode_zone_base_inventory" ADD COLUMN     "base_inventory_value" DOUBLE PRECISION,
ADD COLUMN     "high_max" DOUBLE PRECISION,
ADD COLUMN     "hv" DOUBLE PRECISION,
ADD COLUMN     "low_max" DOUBLE PRECISION;
