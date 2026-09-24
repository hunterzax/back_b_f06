-- AlterTable
ALTER TABLE "public"."account_password_check" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."group" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."history" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."system_login" ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date_num" INTEGER;
