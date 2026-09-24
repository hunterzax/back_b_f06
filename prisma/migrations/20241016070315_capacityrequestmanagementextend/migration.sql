-- CreateTable
CREATE TABLE "public"."extend_contract_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "shadow_time" INTEGER,
    "shadow_period" INTEGER,
    "new_shadow_time" INTEGER,
    "new_shadow_period" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "contract_code_id" INTEGER,
    "temp_submitted_timestamp" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "period_count" INTEGER,

    CONSTRAINT "extend_contract_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."extend_contract_capacity_request_management" ADD CONSTRAINT "extend_contract_capacity_request_management_contract_code__fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."extend_contract_capacity_request_management" ADD CONSTRAINT "extend_contract_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."extend_contract_capacity_request_management" ADD CONSTRAINT "extend_contract_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
