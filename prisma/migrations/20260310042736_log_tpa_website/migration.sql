-- CreateTable
CREATE TABLE "public"."log_tpa_website" (
    "id" SERIAL NOT NULL,
    "reqUser" TEXT,
    "type" TEXT,
    "value" JSONB,
    "time" TIMESTAMP(3),
    "time_num" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "module" TEXT,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "log_tpa_website_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."log_tpa_website" ADD CONSTRAINT "log_tpa_website_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_tpa_website" ADD CONSTRAINT "log_tpa_website_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
