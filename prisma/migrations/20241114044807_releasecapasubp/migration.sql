-- CreateTable
CREATE TABLE "public"."release_capacity_submission" (
    "id" SERIAL NOT NULL,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "release_capacity_status_id" INTEGER,
    "reasons" TEXT,
    "submission_time" TIMESTAMP(3),
    "approve_time" TIMESTAMP(3),
    "reject_time" TIMESTAMP(3),
    "release_capacity_submission_file_id" INTEGER,

    CONSTRAINT "release_capacity_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."release_capacity_submission_detail" (
    "id" SERIAL NOT NULL,
    "release_capacity_submission_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "temp_contract_point" TEXT,
    "temp_start_date" TIMESTAMP(3),
    "temp_end_date" TIMESTAMP(3),
    "contracted_mmbtu_d" TEXT,
    "contracted_mmscfd" TEXT,
    "release_mmbtu_d" TEXT,
    "release_mmscfd" TEXT,
    "booking_row_json_id" INTEGER,

    CONSTRAINT "release_capacity_submission_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."release_capacity_submission_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "release_capacity_submission_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."release_capacity_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "release_capacity_status_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_release_capacity_status_id_fkey" FOREIGN KEY ("release_capacity_status_id") REFERENCES "public"."release_capacity_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission" ADD CONSTRAINT "release_capacity_submission_release_capacity_submission_fi_fkey" FOREIGN KEY ("release_capacity_submission_file_id") REFERENCES "public"."release_capacity_submission_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_release_capacity_submis_fkey" FOREIGN KEY ("release_capacity_submission_id") REFERENCES "public"."release_capacity_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_detail" ADD CONSTRAINT "release_capacity_submission_detail_booking_row_json_id_fkey" FOREIGN KEY ("booking_row_json_id") REFERENCES "public"."booking_row_json"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file" ADD CONSTRAINT "release_capacity_submission_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file" ADD CONSTRAINT "release_capacity_submission_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
