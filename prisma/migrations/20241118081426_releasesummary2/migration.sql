-- CreateTable
CREATE TABLE "public"."release_summary_detail" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "release_start_date" TIMESTAMP(3),
    "release_end_date" TIMESTAMP(3),
    "release_summary_id" INTEGER,
    "temp_contract_point" TEXT,
    "temp_zone" TEXT,
    "temp_area" TEXT,
    "total_contracted_mmbtu_d" TEXT,
    "total_release_mmbtu_d" TEXT,
    "booking_row_json_id" INTEGER,
    "entry_exit_id" INTEGER,

    CONSTRAINT "release_summary_detail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_release_summary_id_fkey" FOREIGN KEY ("release_summary_id") REFERENCES "public"."release_summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_booking_row_json_id_fkey" FOREIGN KEY ("booking_row_json_id") REFERENCES "public"."booking_row_json"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_detail" ADD CONSTRAINT "release_summary_detail_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
