-- CreateTable
CREATE TABLE "public"."process_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "process_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nomination_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "nomination_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."new_nomination_deadline" (
    "id" SERIAL NOT NULL,
    "hour" INTEGER,
    "minute" INTEGER,
    "before_gas_day" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "process_type_id" INTEGER,
    "nomination_type_id" INTEGER,

    CONSTRAINT "new_nomination_deadline_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."new_nomination_deadline" ADD CONSTRAINT "new_nomination_deadline_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."new_nomination_deadline" ADD CONSTRAINT "new_nomination_deadline_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."new_nomination_deadline" ADD CONSTRAINT "new_nomination_deadline_process_type_id_fkey" FOREIGN KEY ("process_type_id") REFERENCES "public"."process_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."new_nomination_deadline" ADD CONSTRAINT "new_nomination_deadline_nomination_type_id_fkey" FOREIGN KEY ("nomination_type_id") REFERENCES "public"."nomination_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
