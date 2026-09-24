-- AlterTable
ALTER TABLE "public"."account_reason" ADD COLUMN     "create_by" INTEGER,
ADD COLUMN     "update_by" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."account_reason" ADD CONSTRAINT "account_reason_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_reason" ADD CONSTRAINT "account_reason_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
