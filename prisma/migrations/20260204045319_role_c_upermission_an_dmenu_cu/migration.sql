-- AlterTable
ALTER TABLE "public"."menus_config" ADD COLUMN     "create_by" INTEGER,
ADD COLUMN     "update_by" INTEGER;

-- AlterTable
ALTER TABLE "public"."role" ADD COLUMN     "create_permission_by" INTEGER,
ADD COLUMN     "update_permission_by" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."role" ADD CONSTRAINT "role_create_permission_by_fkey" FOREIGN KEY ("create_permission_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role" ADD CONSTRAINT "role_update_permission_by_fkey" FOREIGN KEY ("update_permission_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."menus_config" ADD CONSTRAINT "menus_config_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."menus_config" ADD CONSTRAINT "menus_config_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
