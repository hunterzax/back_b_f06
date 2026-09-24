/*
  Warnings:

  - You are about to drop the column `revised_capacity_path_edges_id` on the `config_master_path` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."config_master_path" DROP CONSTRAINT "config_master_path_revised_capacity_path_edges_id_fkey";

-- AlterTable
ALTER TABLE "public"."config_master_path" DROP COLUMN "revised_capacity_path_edges_id";

-- AlterTable
ALTER TABLE "public"."revised_capacity_path_edges" ADD COLUMN     "config_master_path_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path_edges" ADD CONSTRAINT "revised_capacity_path_edges_config_master_path_id_fkey" FOREIGN KEY ("config_master_path_id") REFERENCES "public"."config_master_path"("id") ON DELETE SET NULL ON UPDATE CASCADE;
