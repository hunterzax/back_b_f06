/*
  Warnings:

  - You are about to drop the column `c1_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c1_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c2_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c2_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c2_plus_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c2_plus_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c3_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c3_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c6_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c6_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c7_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `c7_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `carbon_dioxide_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `carbon_dioxide_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `dew_point_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `dew_point_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `hydrogen_suifide_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `hydrogen_suifide_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `ic4_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `ic4_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `k5_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `k5_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `mercury_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `mercury_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `moisture_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `moisture_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nc4_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nc4_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nc5_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nc5_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nitrogen_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `nitrogen_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `oxygen_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `oxygen_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `sg_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `sg_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `total_sulphur_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `total_sulphur_min` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `wobbe_index_max` on the `zone_master_quality` table. All the data in the column will be lost.
  - You are about to drop the column `wobbe_index_min` on the `zone_master_quality` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."zone_master_quality" DROP COLUMN "c1_max",
DROP COLUMN "c1_min",
DROP COLUMN "c2_max",
DROP COLUMN "c2_min",
DROP COLUMN "c2_plus_max",
DROP COLUMN "c2_plus_min",
DROP COLUMN "c3_max",
DROP COLUMN "c3_min",
DROP COLUMN "c6_max",
DROP COLUMN "c6_min",
DROP COLUMN "c7_max",
DROP COLUMN "c7_min",
DROP COLUMN "carbon_dioxide_max",
DROP COLUMN "carbon_dioxide_min",
DROP COLUMN "dew_point_max",
DROP COLUMN "dew_point_min",
DROP COLUMN "hydrogen_suifide_max",
DROP COLUMN "hydrogen_suifide_min",
DROP COLUMN "ic4_max",
DROP COLUMN "ic4_min",
DROP COLUMN "k5_max",
DROP COLUMN "k5_min",
DROP COLUMN "mercury_max",
DROP COLUMN "mercury_min",
DROP COLUMN "moisture_max",
DROP COLUMN "moisture_min",
DROP COLUMN "nc4_max",
DROP COLUMN "nc4_min",
DROP COLUMN "nc5_max",
DROP COLUMN "nc5_min",
DROP COLUMN "nitrogen_max",
DROP COLUMN "nitrogen_min",
DROP COLUMN "oxygen_max",
DROP COLUMN "oxygen_min",
DROP COLUMN "sg_max",
DROP COLUMN "sg_min",
DROP COLUMN "total_sulphur_max",
DROP COLUMN "total_sulphur_min",
DROP COLUMN "wobbe_index_max",
DROP COLUMN "wobbe_index_min",
ADD COLUMN     "v2_c2_plus_max" DOUBLE PRECISION,
ADD COLUMN     "v2_c2_plus_min" DOUBLE PRECISION,
ADD COLUMN     "v2_carbon_dioxide_max" DOUBLE PRECISION,
ADD COLUMN     "v2_carbon_dioxide_min" DOUBLE PRECISION,
ADD COLUMN     "v2_carbon_dioxide_nitrogen_max" DOUBLE PRECISION,
ADD COLUMN     "v2_carbon_dioxide_nitrogen_min" DOUBLE PRECISION,
ADD COLUMN     "v2_hydrocarbon_dew_max" DOUBLE PRECISION,
ADD COLUMN     "v2_hydrocarbon_dew_min" DOUBLE PRECISION,
ADD COLUMN     "v2_hydrogen_sulfide_max" DOUBLE PRECISION,
ADD COLUMN     "v2_hydrogen_sulfide_min" DOUBLE PRECISION,
ADD COLUMN     "v2_mercury_max" DOUBLE PRECISION,
ADD COLUMN     "v2_mercury_min" DOUBLE PRECISION,
ADD COLUMN     "v2_methane_max" DOUBLE PRECISION,
ADD COLUMN     "v2_methane_min" DOUBLE PRECISION,
ADD COLUMN     "v2_moisture_max" DOUBLE PRECISION,
ADD COLUMN     "v2_moisture_min" DOUBLE PRECISION,
ADD COLUMN     "v2_nitrogen_max" DOUBLE PRECISION,
ADD COLUMN     "v2_nitrogen_min" DOUBLE PRECISION,
ADD COLUMN     "v2_oxygen_max" DOUBLE PRECISION,
ADD COLUMN     "v2_oxygen_min" DOUBLE PRECISION,
ADD COLUMN     "v2_sat_heating_value_max" DOUBLE PRECISION,
ADD COLUMN     "v2_sat_heating_value_min" DOUBLE PRECISION,
ADD COLUMN     "v2_total_sulphur_max" DOUBLE PRECISION,
ADD COLUMN     "v2_total_sulphur_min" DOUBLE PRECISION,
ADD COLUMN     "v2_wobbe_index_max" DOUBLE PRECISION,
ADD COLUMN     "v2_wobbe_index_min" DOUBLE PRECISION;
