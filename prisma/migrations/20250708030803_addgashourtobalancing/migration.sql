-- AlterTable
ALTER TABLE "public"."balancing_adjust_accumulated_imbalance" ADD COLUMN     "gas_hour" INTEGER;

-- AlterTable
ALTER TABLE "public"."balancing_adjustment_daily_imbalance" ADD COLUMN     "gas_hour" INTEGER;
