-- CreateTable
CREATE TABLE "public"."edit_email_group_for_event" (
    "id" SERIAL NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "edit_email_group_for_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."edit_email_group_for_event_match" (
    "id" SERIAL NOT NULL,
    "edit_email_group_for_event_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "edit_email_group_for_event_match_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event" ADD CONSTRAINT "edit_email_group_for_event_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event" ADD CONSTRAINT "edit_email_group_for_event_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event_match" ADD CONSTRAINT "edit_email_group_for_event_match_edit_email_group_for_even_fkey" FOREIGN KEY ("edit_email_group_for_event_id") REFERENCES "public"."edit_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event_match" ADD CONSTRAINT "edit_email_group_for_event_match_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edit_email_group_for_event_match" ADD CONSTRAINT "edit_email_group_for_event_match_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
