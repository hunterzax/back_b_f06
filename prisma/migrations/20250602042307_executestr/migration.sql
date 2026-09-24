-- CreateTable
CREATE TABLE "public"."execute_runnumber" (
    "id" SERIAL NOT NULL,
    "request_number_type" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "execute_runnumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."execute_eod" (
    "id" SERIAL NOT NULL,
    "request_number_id" INTEGER,
    "execute_timestamp" INTEGER,
    "finish_timestamp" INTEGER,
    "status" TEXT,
    "msg" TEXT,
    "start_data" TEXT,
    "start_data_date" TIMESTAMP(3),
    "end_data" TEXT,
    "end_data_date" TIMESTAMP(3),
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "execute_eod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."execute_intraday" (
    "id" SERIAL NOT NULL,
    "request_number_id" INTEGER,
    "execute_timestamp" INTEGER,
    "finish_timestamp" INTEGER,
    "status" TEXT,
    "msg" TEXT,
    "request_number_previous_hour" INTEGER,
    "request_number_eod_id" INTEGER,
    "gas_day" TEXT,
    "gas_day_date" TIMESTAMP(3),
    "gas_hour" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "execute_intraday_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."execute_runnumber" ADD CONSTRAINT "execute_runnumber_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_runnumber" ADD CONSTRAINT "execute_runnumber_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_eod" ADD CONSTRAINT "execute_eod_request_number_id_fkey" FOREIGN KEY ("request_number_id") REFERENCES "public"."execute_runnumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_eod" ADD CONSTRAINT "execute_eod_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_eod" ADD CONSTRAINT "execute_eod_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_intraday" ADD CONSTRAINT "execute_intraday_request_number_id_fkey" FOREIGN KEY ("request_number_id") REFERENCES "public"."execute_runnumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_intraday" ADD CONSTRAINT "execute_intraday_request_number_eod_id_fkey" FOREIGN KEY ("request_number_eod_id") REFERENCES "public"."execute_eod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_intraday" ADD CONSTRAINT "execute_intraday_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."execute_intraday" ADD CONSTRAINT "execute_intraday_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
