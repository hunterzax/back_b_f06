-- CreateTable
CREATE TABLE "public"."reserve_balancing_gas_contract" (
    "id" SERIAL NOT NULL,
    "res_bal_gas_contract" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "reserve_balancing_gas_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reserve_balancing_gas_contract_comment" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "reserve_balancing_gas_contract_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "reserve_balancing_gas_contract_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reserve_balancing_gas_contract_files" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "reserve_balancing_gas_contract_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "reserve_balancing_gas_contract_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reserve_balancing_gas_contract_detail" (
    "id" SERIAL NOT NULL,
    "reserve_balancing_gas_contract_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "daily_reserve_cap_mmbtu_d" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "area_id" INTEGER,
    "zone_id" INTEGER,
    "entry_exit_id" INTEGER,
    "nomination_point_id" INTEGER,

    CONSTRAINT "reserve_balancing_gas_contract_detail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract" ADD CONSTRAINT "reserve_balancing_gas_contract_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract" ADD CONSTRAINT "reserve_balancing_gas_contract_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract" ADD CONSTRAINT "reserve_balancing_gas_contract_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_comment" ADD CONSTRAINT "reserve_balancing_gas_contract_comment_reserve_balancing_g_fkey" FOREIGN KEY ("reserve_balancing_gas_contract_id") REFERENCES "public"."reserve_balancing_gas_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_comment" ADD CONSTRAINT "reserve_balancing_gas_contract_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_comment" ADD CONSTRAINT "reserve_balancing_gas_contract_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_files" ADD CONSTRAINT "reserve_balancing_gas_contract_files_reserve_balancing_gas_fkey" FOREIGN KEY ("reserve_balancing_gas_contract_id") REFERENCES "public"."reserve_balancing_gas_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_files" ADD CONSTRAINT "reserve_balancing_gas_contract_files_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_files" ADD CONSTRAINT "reserve_balancing_gas_contract_files_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_reserve_balancing_ga_fkey" FOREIGN KEY ("reserve_balancing_gas_contract_id") REFERENCES "public"."reserve_balancing_gas_contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reserve_balancing_gas_contract_detail" ADD CONSTRAINT "reserve_balancing_gas_contract_detail_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
