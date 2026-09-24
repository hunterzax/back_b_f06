-- CreateTable
CREATE TABLE "public"."system_parameter" (
    "id" SERIAL NOT NULL,
    "menus_id" INTEGER,
    "system_parameter_id" INTEGER,
    "value" TEXT,
    "link" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "system_parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_notification_management" (
    "id" SERIAL NOT NULL,
    "menus_id" INTEGER,
    "activity_id" INTEGER,
    "subject" TEXT,
    "detail" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "email_notification_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."system_parameter" ADD CONSTRAINT "system_parameter_menus_id_fkey" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_parameter" ADD CONSTRAINT "system_parameter_system_parameter_id_fkey" FOREIGN KEY ("system_parameter_id") REFERENCES "public"."sub_system_parameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_parameter" ADD CONSTRAINT "system_parameter_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_parameter" ADD CONSTRAINT "system_parameter_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_notification_management" ADD CONSTRAINT "email_notification_management_menus_id_fkey" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_notification_management" ADD CONSTRAINT "email_notification_management_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."sub_email_notification_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_notification_management" ADD CONSTRAINT "email_notification_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_notification_management" ADD CONSTRAINT "email_notification_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
