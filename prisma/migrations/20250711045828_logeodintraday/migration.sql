-- CreateTable
CREATE TABLE "public"."log_execute_eod" (
    "id" SERIAL NOT NULL,
    "request_number" INTEGER,
    "execute_timestamp" INTEGER,
    "start_date" TEXT,
    "end_date" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "log_execute_eod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."log_execute_intraday" (
    "id" SERIAL NOT NULL,
    "request_number" INTEGER,
    "request_number_previous_hour" INTEGER,
    "request_number_eod" INTEGER,
    "execute_timestamp" INTEGER,
    "gas_day" TEXT,
    "gas_hour" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "log_execute_intraday_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."log_execute_eod" ADD CONSTRAINT "log_execute_eod_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_execute_eod" ADD CONSTRAINT "log_execute_eod_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_execute_intraday" ADD CONSTRAINT "log_execute_intraday_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_execute_intraday" ADD CONSTRAINT "log_execute_intraday_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
