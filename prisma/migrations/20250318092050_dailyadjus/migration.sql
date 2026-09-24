-- CreateTable
CREATE TABLE "public"."daily_adjustment" (
    "id" SERIAL NOT NULL,
    "daily_code" TEXT,
    "daily_adjustment_status_id" INTEGER,
    "gas_day" TIMESTAMP(3),
    "time" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "daily_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_adjustment_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "daily_adjustment_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_adjustment_group" (
    "id" SERIAL NOT NULL,
    "daily_adjustment_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "daily_adjustment_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_adjustment_reason" (
    "id" SERIAL NOT NULL,
    "daily_adjustment_id" INTEGER,
    "daily_adjustment_status_id" INTEGER,
    "reason" TEXT,
    "status" BOOLEAN,
    "active" BOOLEAN,
    "time_num" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "daily_adjustment_reason_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment" ADD CONSTRAINT "daily_adjustment_daily_adjustment_status_id_fkey" FOREIGN KEY ("daily_adjustment_status_id") REFERENCES "public"."daily_adjustment_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment" ADD CONSTRAINT "daily_adjustment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment" ADD CONSTRAINT "daily_adjustment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_group" ADD CONSTRAINT "daily_adjustment_group_daily_adjustment_id_fkey" FOREIGN KEY ("daily_adjustment_id") REFERENCES "public"."daily_adjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_group" ADD CONSTRAINT "daily_adjustment_group_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_reason" ADD CONSTRAINT "daily_adjustment_reason_daily_adjustment_id_fkey" FOREIGN KEY ("daily_adjustment_id") REFERENCES "public"."daily_adjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_reason" ADD CONSTRAINT "daily_adjustment_reason_daily_adjustment_status_id_fkey" FOREIGN KEY ("daily_adjustment_status_id") REFERENCES "public"."daily_adjustment_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_reason" ADD CONSTRAINT "daily_adjustment_reason_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_reason" ADD CONSTRAINT "daily_adjustment_reason_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
