-- AlterTable
ALTER TABLE "public"."new_nomination_deadline" ADD COLUMN     "user_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."new_nomination_deadline" ADD CONSTRAINT "new_nomination_deadline_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
