-- CreateTable
CREATE TABLE "public"."balancing_monthly_report_approved" (
    "id" SERIAL NOT NULL,
    "monthText" TEXT,
    "contractCode" TEXT,
    "file" TEXT,
    "version" TEXT,
    "typeReport" TEXT,
    "jsonData" TEXT,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "balancing_monthly_report_approved_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."balancing_monthly_report_approved" ADD CONSTRAINT "balancing_monthly_report_approved_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."balancing_monthly_report_approved" ADD CONSTRAINT "balancing_monthly_report_approved_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
