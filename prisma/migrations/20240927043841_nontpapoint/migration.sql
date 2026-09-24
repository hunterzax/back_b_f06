-- CreateTable
CREATE TABLE "public"."non_tpa_point" (
    "id" SERIAL NOT NULL,
    "non_tpa_point_name" TEXT,
    "description" TEXT,
    "area_id" INTEGER,
    "nomination_point_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "non_tpa_point_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "non_tpa_point_non_tpa_point_name_key" ON "public"."non_tpa_point"("non_tpa_point_name");

-- AddForeignKey
ALTER TABLE "public"."non_tpa_point" ADD CONSTRAINT "non_tpa_point_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."non_tpa_point" ADD CONSTRAINT "non_tpa_point_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."non_tpa_point" ADD CONSTRAINT "non_tpa_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."non_tpa_point" ADD CONSTRAINT "non_tpa_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
