-- AlterTable
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD COLUMN     "query_shipper_nomination_type_comment_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."query_shipper_nomination_type_comment" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "query_shipper_nomination_type_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."query_shipper_nomination_file_comment" ADD CONSTRAINT "query_shipper_nomination_file_comment_query_shipper_nomina_fkey" FOREIGN KEY ("query_shipper_nomination_type_comment_id") REFERENCES "public"."query_shipper_nomination_type_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
