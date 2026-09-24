-- CreateTable
CREATE TABLE "public"."release_capacity_submission_file_document" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "release_capacity_submission_id" INTEGER,

    CONSTRAINT "release_capacity_submission_file_document_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file_document" ADD CONSTRAINT "release_capacity_submission_file_document_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file_document" ADD CONSTRAINT "release_capacity_submission_file_document_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_capacity_submission_file_document" ADD CONSTRAINT "release_capacity_submission_file_document_release_capacity_fkey" FOREIGN KEY ("release_capacity_submission_id") REFERENCES "public"."release_capacity_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
