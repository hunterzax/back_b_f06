-- AlterTable
ALTER TABLE "public"."nomination_point" ADD COLUMN     "customer_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_customer_type_id_fkey" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
