-- AlterTable
ALTER TABLE "public"."_NomAndContractPoint" ADD CONSTRAINT "_NomAndContractPoint_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "public"."_NomAndContractPoint_AB_unique";

-- AddForeignKey
ALTER TABLE "public"."event_doc_gas_shipper" ADD CONSTRAINT "event_doc_gas_shipper_nom_point_fkey" FOREIGN KEY ("nom_point") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
