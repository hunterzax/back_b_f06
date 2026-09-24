/*
  Warnings:

  - The `other_default_b_manage` column on the `menus` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `shipper_default_b_manage` column on the `menus` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `tso_default_b_manage` column on the `menus` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."menus" DROP COLUMN "other_default_b_manage",
ADD COLUMN     "other_default_b_manage" BOOLEAN,
DROP COLUMN "shipper_default_b_manage",
ADD COLUMN     "shipper_default_b_manage" BOOLEAN,
DROP COLUMN "tso_default_b_manage",
ADD COLUMN     "tso_default_b_manage" BOOLEAN;
