-- CreateTable
CREATE TABLE "public"."login_logs" (
    "id" SERIAL NOT NULL,
    "event" TEXT,
    "account_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "create_date_num" INTEGER,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."login_logs" ADD CONSTRAINT "login_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
