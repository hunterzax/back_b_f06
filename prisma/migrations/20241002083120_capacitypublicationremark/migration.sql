-- CreateTable
CREATE TABLE "public"."capacity_publication_remark" (
    "id" SERIAL NOT NULL,
    "remark" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "capacity_publication_remark_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_remark" ADD CONSTRAINT "capacity_publication_remark_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_remark" ADD CONSTRAINT "capacity_publication_remark_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
