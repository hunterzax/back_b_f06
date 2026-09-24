-- AlterTable
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD COLUMN     "concept_point_id" INTEGER,
ADD COLUMN     "meter_concept_type_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."meter_concept_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "meter_concept_type_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_concept_point_id_fkey" FOREIGN KEY ("concept_point_id") REFERENCES "public"."concept_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_meter_concept_typ_fkey" FOREIGN KEY ("meter_concept_type_id") REFERENCES "public"."meter_concept_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
