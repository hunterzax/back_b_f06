-- CreateTable
CREATE TABLE "public"."capacity_publication_detail" (
    "id" SERIAL NOT NULL,
    "area_id" INTEGER,
    "avaliable_capacity_mmbtu_d" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_publication_detail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_detail" ADD CONSTRAINT "capacity_publication_detail_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_detail" ADD CONSTRAINT "capacity_publication_detail_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_detail" ADD CONSTRAINT "capacity_publication_detail_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
