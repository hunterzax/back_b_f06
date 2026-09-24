-- AlterTable
ALTER TABLE "public"."execute_eod" ADD COLUMN     "sort" TEXT;

-- AlterTable
ALTER TABLE "public"."execute_intraday" ADD COLUMN     "sort" TEXT;

-- CreateTable
CREATE TABLE "public"."division_group_show" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER,
    "division_id" INTEGER,

    CONSTRAINT "division_group_show_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."division_group_show" ADD CONSTRAINT "division_group_show_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."division_group_show" ADD CONSTRAINT "division_group_show_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
