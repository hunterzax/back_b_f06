-- CreateTable
CREATE TABLE "public"."east_west_supply_reference_quality_area" (
    "id" SERIAL NOT NULL,
    "east_area_id" INTEGER,
    "west_area_id" INTEGER,

    CONSTRAINT "east_west_supply_reference_quality_area_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."east_west_supply_reference_quality_area" ADD CONSTRAINT "east_west_supply_reference_quality_area_east_area_id_fkey" FOREIGN KEY ("east_area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."east_west_supply_reference_quality_area" ADD CONSTRAINT "east_west_supply_reference_quality_area_west_area_id_fkey" FOREIGN KEY ("west_area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
