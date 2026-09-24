-- AlterTable
ALTER TABLE "public"."contract_code" ADD COLUMN     "status_capacity_request_management_process_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."status_capacity_request_management_process" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "status_capacity_request_management_process_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_status_capacity_request_management_process_i_fkey" FOREIGN KEY ("status_capacity_request_management_process_id") REFERENCES "public"."status_capacity_request_management_process"("id") ON DELETE SET NULL ON UPDATE CASCADE;
