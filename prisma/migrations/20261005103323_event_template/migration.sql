-- CreateTable
CREATE TABLE "public"."event_template" (
    "id" SERIAL NOT NULL,
    "template_name" TEXT,
    "event_doc_master_id" INTEGER,
    "template_data" JSONB,
    "active" BOOLEAN DEFAULT true,
    "del_flag" BOOLEAN DEFAULT false,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_template_history" (
    "id" SERIAL NOT NULL,
    "template_name" TEXT,
    "event_template_id" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_template_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_template" ADD CONSTRAINT "event_template_event_doc_master_id_fkey" FOREIGN KEY ("event_doc_master_id") REFERENCES "public"."event_doc_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_template" ADD CONSTRAINT "event_template_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_template" ADD CONSTRAINT "event_template_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_template_history" ADD CONSTRAINT "event_template_history_event_template_id_fkey" FOREIGN KEY ("event_template_id") REFERENCES "public"."event_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_template_history" ADD CONSTRAINT "event_template_history_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_template_history" ADD CONSTRAINT "event_template_history_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
