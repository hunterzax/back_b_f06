-- CreateTable
CREATE TABLE "public"."contract_code" (
    "id" SERIAL NOT NULL,
    "contract_code" TEXT,
    "submitted_timestamp" TIMESTAMP(3),
    "contract_start_date" TIMESTAMP(3),
    "contract_end_date" TIMESTAMP(3),
    "extend_deadline" TIMESTAMP(3),
    "terminate_date" TIMESTAMP(3),
    "group_id" INTEGER,
    "type_account_id" INTEGER,
    "status_capacity_request_management_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "shadow_time" INTEGER,
    "shadow_period" INTEGER,
    "reject_reasons" TEXT,

    CONSTRAINT "contract_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."status_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "status_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submission_comment_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "submission_comment_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."file_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "file_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_type_account_id_fkey" FOREIGN KEY ("type_account_id") REFERENCES "public"."type_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_status_capacity_request_management_id_fkey" FOREIGN KEY ("status_capacity_request_management_id") REFERENCES "public"."status_capacity_request_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_code" ADD CONSTRAINT "contract_code_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_capacity_request_management" ADD CONSTRAINT "submission_comment_capacity_request_management_contract_co_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_capacity_request_management" ADD CONSTRAINT "submission_comment_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."submission_comment_capacity_request_management" ADD CONSTRAINT "submission_comment_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_capacity_request_management" ADD CONSTRAINT "file_capacity_request_management_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_capacity_request_management" ADD CONSTRAINT "file_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_capacity_request_management" ADD CONSTRAINT "file_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
