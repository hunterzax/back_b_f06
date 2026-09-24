-- AlterTable
ALTER TABLE "public"."menus" ADD COLUMN     "flag_email_notimanagement" BOOLEAN,
ADD COLUMN     "flag_system_parameter" BOOLEAN;

-- CreateTable
CREATE TABLE "public"."sub_system_parameter" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "menus_id" INTEGER,

    CONSTRAINT "sub_system_parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sub_email_notification_management" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "menus_id" INTEGER,

    CONSTRAINT "sub_email_notification_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."sub_system_parameter" ADD CONSTRAINT "sub_system_parameter_menus_id_fkey" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sub_email_notification_management" ADD CONSTRAINT "sub_email_notification_management_menus_id_fkey" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
