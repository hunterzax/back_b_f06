-- AlterTable
ALTER TABLE "public"."account_manage" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."account_password_check" ADD COLUMN     "update_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."account_reason" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."account_role" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."bank_master" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."column_field" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."column_table" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."column_table_config" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."division" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."history" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "update_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."menus" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."menus_config" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."mode_account" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."role_default" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."system_login_account" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."t_and_c" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."type_account" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."user_type" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;
