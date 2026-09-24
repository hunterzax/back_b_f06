-- CreateTable
CREATE TABLE "public"."limit_concept_point" (
    "id" SERIAL NOT NULL,
    "concept_point_id" INTEGER,
    "group_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "limit_concept_point_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."limit_concept_point" ADD CONSTRAINT "limit_concept_point_concept_point_id_fkey" FOREIGN KEY ("concept_point_id") REFERENCES "public"."concept_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."limit_concept_point" ADD CONSTRAINT "limit_concept_point_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."limit_concept_point" ADD CONSTRAINT "limit_concept_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."limit_concept_point" ADD CONSTRAINT "limit_concept_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
