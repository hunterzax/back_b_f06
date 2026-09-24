-- CreateTable
CREATE TABLE "public"."term_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "term_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."planning_deadline" (
    "id" SERIAL NOT NULL,
    "hour" INTEGER,
    "minute" INTEGER,
    "day" INTEGER,
    "before_month" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "term_type_id" INTEGER,

    CONSTRAINT "planning_deadline_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."planning_deadline" ADD CONSTRAINT "planning_deadline_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_deadline" ADD CONSTRAINT "planning_deadline_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_deadline" ADD CONSTRAINT "planning_deadline_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
