-- CreateTable
CREATE TABLE "public"."intraday_dashboard_sent_email" (
    "id" SERIAL NOT NULL,
    "subject" TEXT,
    "detail" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "intraday_dashboard_sent_email_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."intraday_dashboard_sent_email" ADD CONSTRAINT "intraday_dashboard_sent_email_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intraday_dashboard_sent_email" ADD CONSTRAINT "intraday_dashboard_sent_email_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
