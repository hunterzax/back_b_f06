-- AlterTable
ALTER TABLE "public"."east_west_supply_reference_quality_area" ADD COLUMN     "owner_area_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."east_west_supply_reference_quality_area" ADD CONSTRAINT "east_west_supply_reference_quality_area_owner_area_id_fkey" FOREIGN KEY ("owner_area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
