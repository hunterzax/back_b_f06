-- CreateTable
CREATE TABLE "public"."event_doc_master" (
    "id" SERIAL NOT NULL,
    "doc" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_doc_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_document" (
    "id" SERIAL NOT NULL,
    "event_runnumber_id" INTEGER,
    "event_doc_status_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_document_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_doc_master" ADD CONSTRAINT "event_doc_master_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_doc_master" ADD CONSTRAINT "event_doc_master_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_event_runnumber_id_fkey" FOREIGN KEY ("event_runnumber_id") REFERENCES "public"."event_runnumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_event_doc_status_id_fkey" FOREIGN KEY ("event_doc_status_id") REFERENCES "public"."event_doc_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
