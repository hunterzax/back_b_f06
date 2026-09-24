-- AlterTable
ALTER TABLE "public"."contract_code" ADD COLUMN     "term_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
