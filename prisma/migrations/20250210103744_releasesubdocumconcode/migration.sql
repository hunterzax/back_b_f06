-- AlterTable
ALTER TABLE "public"."release_capacity_submission_file_document" ADD COLUMN     "active" BOOLEAN,
ADD COLUMN     "contract_code_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file_document" ADD CONSTRAINT "release_capacity_submission_file_document_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;
