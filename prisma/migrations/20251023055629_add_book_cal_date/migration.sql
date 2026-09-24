-- AlterTable
ALTER TABLE "public"."contract_code" ADD COLUMN     "lastest_cal_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file" ADD COLUMN     "reserve_balancing_gas_contract_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file" ADD CONSTRAINT "query_shipper_nomination_file_reserve_balancing_gas_contra_fkey" FOREIGN KEY ("reserve_balancing_gas_contract_id") REFERENCES "public"."reserve_balancing_gas_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
