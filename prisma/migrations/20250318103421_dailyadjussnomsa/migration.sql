/*
  Warnings:

  - You are about to drop the column `valumeMMSCFD` on the `daily_adjustment_nom` table. All the data in the column will be lost.
  - You are about to drop the column `valumeMMSCFD2` on the `daily_adjustment_nom` table. All the data in the column will be lost.
  - You are about to drop the column `valumeMMSCFH` on the `daily_adjustment_nom` table. All the data in the column will be lost.
  - You are about to drop the column `valumeMMSCFH2` on the `daily_adjustment_nom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."daily_adjustment_nom" DROP COLUMN "valumeMMSCFD",
DROP COLUMN "valumeMMSCFD2",
DROP COLUMN "valumeMMSCFH",
DROP COLUMN "valumeMMSCFH2",
ADD COLUMN     "valume_mmscfd" TEXT,
ADD COLUMN     "valume_mmscfd2" TEXT,
ADD COLUMN     "valume_mmscfh" TEXT,
ADD COLUMN     "valume_mmscfh2" TEXT;
