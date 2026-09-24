-- CreateTable
CREATE TABLE "public"."tariff_type_charge" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "tariff_type_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "tariff_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_invoice_sent" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "tariff_invoice_sent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_comment" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "tariff_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff" (
    "id" SERIAL NOT NULL,
    "tariff_id" TEXT,
    "shipper_id" INTEGER,
    "month_year_charge" TEXT,
    "tariff_type_id" INTEGER,
    "tariff_invoice_sent_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_charge" (
    "id" SERIAL NOT NULL,
    "tariff_id" INTEGER,
    "contract_code_id" INTEGER,
    "term_type_id" INTEGER,
    "quantity_operator" TEXT,
    "quantity" TEXT,
    "unit" TEXT,
    "co_efficient" TEXT,
    "fee" TEXT,
    "amount" TEXT,
    "amount_operator" TEXT,
    "amount_compare" TEXT,
    "difference" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tariff_view_date" (
    "id" SERIAL NOT NULL,
    "tariff_charge_id" INTEGER,
    "temps" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "tariff_view_date_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."tariff_comment" ADD CONSTRAINT "tariff_comment_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_comment" ADD CONSTRAINT "tariff_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_comment" ADD CONSTRAINT "tariff_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_tariff_type_id_fkey" FOREIGN KEY ("tariff_type_id") REFERENCES "public"."tariff_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_tariff_invoice_sent_id_fkey" FOREIGN KEY ("tariff_invoice_sent_id") REFERENCES "public"."tariff_invoice_sent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff" ADD CONSTRAINT "tariff_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_charge" ADD CONSTRAINT "tariff_charge_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_view_date" ADD CONSTRAINT "tariff_view_date_tariff_charge_id_fkey" FOREIGN KEY ("tariff_charge_id") REFERENCES "public"."tariff_charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_view_date" ADD CONSTRAINT "tariff_view_date_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tariff_view_date" ADD CONSTRAINT "tariff_view_date_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
