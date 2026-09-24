-- CreateTable
CREATE TABLE "public"."event_runnumber" (
    "id" SERIAL NOT NULL,
    "event_nember" TEXT,
    "event_date" TIMESTAMP(3),
    "event_status_id" INTEGER,
    "user_type_id" INTEGER,
    "group_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "event_runnumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "event_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_doc_status" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "event_doc_status_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_event_status_id_fkey" FOREIGN KEY ("event_status_id") REFERENCES "public"."event_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_runnumber" ADD CONSTRAINT "event_runnumber_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
