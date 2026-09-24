-- AlterTable
ALTER TABLE "public"."t_and_c" ADD COLUMN     "create_by" INTEGER,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "update_by" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."t_and_c" ADD CONSTRAINT "t_and_c_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."t_and_c" ADD CONSTRAINT "t_and_c_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
