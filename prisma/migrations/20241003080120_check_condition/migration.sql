-- CreateTable
CREATE TABLE "public"."check_condition" (
    "id" SERIAL NOT NULL,
    "orange_value" DOUBLE PRECISION,
    "orange_mode" INTEGER,
    "orange_url" TEXT,
    "yellow_value" DOUBLE PRECISION,
    "yellow_mode" INTEGER,
    "yellow_url" TEXT,
    "purple_url" TEXT,
    "red_url" TEXT,
    "green_url" TEXT,
    "gray_url" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "check_condition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."check_condition" ADD CONSTRAINT "check_condition_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."check_condition" ADD CONSTRAINT "check_condition_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
