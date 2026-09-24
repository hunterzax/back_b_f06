-- CreateTable
CREATE TABLE "public"."allocation_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "allocation_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocation_management" (
    "id" SERIAL NOT NULL,
    "allocation_status_id" INTEGER,
    "review_code" TEXT,
    "name" TEXT,
    "gas_day" TIMESTAMP(3),
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "allocation_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocation_management_shipper_review" (
    "id" SERIAL NOT NULL,
    "allocation_status_id" INTEGER,
    "allocation_management_id" INTEGER,
    "shipper_allocation_review" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "allocation_management_shipper_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocation_management_comment" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "allocation_management_id" INTEGER,
    "allocation_status_id" INTEGER,

    CONSTRAINT "allocation_management_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."closed_balancing_report" (
    "id" SERIAL NOT NULL,
    "date_balance" TIMESTAMP(3),
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "closed_balancing_report_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."allocation_management" ADD CONSTRAINT "allocation_management_allocation_status_id_fkey" FOREIGN KEY ("allocation_status_id") REFERENCES "public"."allocation_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management" ADD CONSTRAINT "allocation_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management" ADD CONSTRAINT "allocation_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_shipper_review" ADD CONSTRAINT "allocation_management_shipper_review_allocation_status_id_fkey" FOREIGN KEY ("allocation_status_id") REFERENCES "public"."allocation_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_shipper_review" ADD CONSTRAINT "allocation_management_shipper_review_allocation_management_fkey" FOREIGN KEY ("allocation_management_id") REFERENCES "public"."allocation_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_shipper_review" ADD CONSTRAINT "allocation_management_shipper_review_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_shipper_review" ADD CONSTRAINT "allocation_management_shipper_review_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_comment" ADD CONSTRAINT "allocation_management_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_comment" ADD CONSTRAINT "allocation_management_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_comment" ADD CONSTRAINT "fk_allocation_management_comment" FOREIGN KEY ("allocation_management_id") REFERENCES "public"."allocation_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_management_comment" ADD CONSTRAINT "fk_allocation_status_comment" FOREIGN KEY ("allocation_status_id") REFERENCES "public"."allocation_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."closed_balancing_report" ADD CONSTRAINT "closed_balancing_report_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."closed_balancing_report" ADD CONSTRAINT "closed_balancing_report_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
