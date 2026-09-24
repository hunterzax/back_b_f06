-- AlterTable
ALTER TABLE "public"."event_document" ADD COLUMN     "group_id" INTEGER,
ADD COLUMN     "user_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_document" ADD CONSTRAINT "event_document_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
