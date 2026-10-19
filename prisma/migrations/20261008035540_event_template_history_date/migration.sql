-- AlterTable
ALTER TABLE "public"."event_template_history" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;
