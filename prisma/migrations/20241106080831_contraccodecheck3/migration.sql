-- AlterTable
ALTER TABLE "public"."contract_code" ADD COLUMN     "ref_contract_code_by_main_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_ref_contract_code_by_main_id_fkey" FOREIGN KEY ("ref_contract_code_by_main_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;
