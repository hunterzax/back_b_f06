-- AlterTable
ALTER TABLE "public"."division" ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "start_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."concept_point" (
    "id" SERIAL NOT NULL,
    "concept_point" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "type_concept_point_id" INTEGER,

    CONSTRAINT "concept_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."type_concept_point" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "group_type_concept_point_id" INTEGER,

    CONSTRAINT "type_concept_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."group_type_concept_point" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "group_type_concept_point_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."concept_point" ADD CONSTRAINT "concept_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."concept_point" ADD CONSTRAINT "concept_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."concept_point" ADD CONSTRAINT "concept_point_type_concept_point_id_fkey" FOREIGN KEY ("type_concept_point_id") REFERENCES "public"."type_concept_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."type_concept_point" ADD CONSTRAINT "type_concept_point_group_type_concept_point_id_fkey" FOREIGN KEY ("group_type_concept_point_id") REFERENCES "public"."group_type_concept_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
