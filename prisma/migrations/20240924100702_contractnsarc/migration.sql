-- AlterTable
ALTER TABLE "public"."contract_nomination_point" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."contract_point" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;

-- AlterTable
ALTER TABLE "public"."nomination_point" ADD COLUMN     "create_date" TIMESTAMP(3),
ADD COLUMN     "create_date_num" INTEGER,
ADD COLUMN     "update_date" TIMESTAMP(3),
ADD COLUMN     "update_date_num" INTEGER;
