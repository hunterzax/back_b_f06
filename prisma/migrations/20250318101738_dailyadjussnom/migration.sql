-- AlterTable
ALTER TABLE "public"."daily_adjustment_nom" ADD COLUMN     "nomination_point_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_nom" ADD CONSTRAINT "daily_adjustment_nom_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
