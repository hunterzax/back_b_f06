-- CreateTable
CREATE TABLE "public"."planning_file_submission_template" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "term_type_id" INTEGER,
    "group_id" INTEGER,
    "nomination_point_id" INTEGER,

    CONSTRAINT "planning_file_submission_template_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template" ADD CONSTRAINT "planning_file_submission_template_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template" ADD CONSTRAINT "planning_file_submission_template_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template" ADD CONSTRAINT "planning_file_submission_template_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template" ADD CONSTRAINT "planning_file_submission_template_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."planning_file_submission_template" ADD CONSTRAINT "planning_file_submission_template_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
