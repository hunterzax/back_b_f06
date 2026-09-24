-- CreateTable
CREATE TABLE "public"."release_summary" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "release_start_date" TIMESTAMP(3),
    "release_end_date" TIMESTAMP(3),
    "submitted_timestamp" TIMESTAMP(3),
    "contract_code_id" INTEGER,
    "group_id" INTEGER,
    "release_type_id" INTEGER,

    CONSTRAINT "release_summary_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_summary" ADD CONSTRAINT "release_summary_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary" ADD CONSTRAINT "release_summary_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary" ADD CONSTRAINT "release_summary_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary" ADD CONSTRAINT "release_summary_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary" ADD CONSTRAINT "release_summary_release_type_id_fkey" FOREIGN KEY ("release_type_id") REFERENCES "public"."release_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
