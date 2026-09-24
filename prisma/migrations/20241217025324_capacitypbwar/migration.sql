-- CreateTable
CREATE TABLE "public"."capacity_publication_warning" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_publication_warning_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_warning" ADD CONSTRAINT "capacity_publication_warning_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_warning" ADD CONSTRAINT "capacity_publication_warning_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_warning" ADD CONSTRAINT "capacity_publication_warning_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
