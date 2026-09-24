-- CreateTable
CREATE TABLE "public"."publication_center" (
    "id" SERIAL NOT NULL,
    "execute_timestamp" INTEGER,
    "gas_day_text" TEXT,
    "gas_day" TIMESTAMP(3),
    "gas_hour" INTEGER,
    "del_flag" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "publication_center_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."publication_center" ADD CONSTRAINT "publication_center_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."publication_center" ADD CONSTRAINT "publication_center_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
