-- AlterTable
ALTER TABLE "public"."booking_template" ADD COLUMN     "term_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."booking_template" ADD CONSTRAINT "booking_template_term_type_id_fkey" FOREIGN KEY ("term_type_id") REFERENCES "public"."term_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
