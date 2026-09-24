-- CreateTable
CREATE TABLE "public"."announcement" (
    "id" SERIAL NOT NULL,
    "topic" TEXT,
    "detail" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."announcement" ADD CONSTRAINT "announcement_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."announcement" ADD CONSTRAINT "announcement_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
