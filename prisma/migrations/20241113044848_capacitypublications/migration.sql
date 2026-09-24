-- CreateTable
CREATE TABLE "public"."capacity_publication" (
    "id" SERIAL NOT NULL,
    "entry_exit_id" INTEGER,
    "zone_id" INTEGER,
    "area_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "capacity_publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."capacity_publication_date" (
    "id" SERIAL NOT NULL,
    "capacity_publication_id" INTEGER,
    "date_day" TIMESTAMP(3),

    CONSTRAINT "capacity_publication_date_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."capacity_publication" ADD CONSTRAINT "capacity_publication_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication" ADD CONSTRAINT "capacity_publication_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication" ADD CONSTRAINT "capacity_publication_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication" ADD CONSTRAINT "capacity_publication_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication" ADD CONSTRAINT "capacity_publication_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."capacity_publication_date" ADD CONSTRAINT "capacity_publication_date_capacity_publication_id_fkey" FOREIGN KEY ("capacity_publication_id") REFERENCES "public"."capacity_publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
