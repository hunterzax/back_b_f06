-- CreateTable
CREATE TABLE "public"."tariff_credit_debit_note" (
    "id" SERIAL NOT NULL,
    "tariff_id" TEXT,
    "shipper_id" INTEGER,
    "month_year_charge" TIMESTAMP(3),
    "cndn_id" TEXT,
    "tariff_credit_debit_note_type_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_credit_debit_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_credit_debit_note_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_credit_debit_note_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_credit_debit_note_comment" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "tariff_credit_debit_note_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_credit_debit_note_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_credit_debit_note_detail" (
    "id" SERIAL NOT NULL,
    "tariff_credit_debit_note_id" INTEGER,
    "contract_code_id" INTEGER,
    "term_type_id" INTEGER,
    "quantity" TEXT,
    "unit" TEXT,
    "fee" TEXT,
    "amount" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_credit_debit_note_detail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note" ADD CONSTRAINT "tariff_credit_debit_note_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note" ADD CONSTRAINT "tariff_credit_debit_note_tariff_credit_debit_note_type_id_fkey" FOREIGN KEY ("tariff_credit_debit_note_type_id") REFERENCES "public"."tariff_credit_debit_note_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note" ADD CONSTRAINT "tariff_credit_debit_note_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note" ADD CONSTRAINT "tariff_credit_debit_note_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_type" ADD CONSTRAINT "tariff_credit_debit_note_type_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_type" ADD CONSTRAINT "tariff_credit_debit_note_type_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_comment" ADD CONSTRAINT "tariff_credit_debit_note_comment_tariff_credit_debit_note__fkey" FOREIGN KEY ("tariff_credit_debit_note_id") REFERENCES "public"."tariff_credit_debit_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_comment" ADD CONSTRAINT "tariff_credit_debit_note_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_comment" ADD CONSTRAINT "tariff_credit_debit_note_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_detail" ADD CONSTRAINT "tariff_credit_debit_note_detail_tariff_credit_debit_note_i_fkey" FOREIGN KEY ("tariff_credit_debit_note_id") REFERENCES "public"."tariff_credit_debit_note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_detail" ADD CONSTRAINT "tariff_credit_debit_note_detail_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_detail" ADD CONSTRAINT "tariff_credit_debit_note_detail_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_detail" ADD CONSTRAINT "tariff_credit_debit_note_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note_detail" ADD CONSTRAINT "tariff_credit_debit_note_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
