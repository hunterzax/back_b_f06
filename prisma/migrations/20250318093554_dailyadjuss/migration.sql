-- AlterTable
ALTER TABLE "public"."daily_adjustment" ADD COLUMN     "area_id" INTEGER,
ADD COLUMN     "entry_exit_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."daily_adjustment_nom" (
    "id" SERIAL NOT NULL,
    "daily_adjustment_id" INTEGER,
    "heating_value" TEXT,
    "valumeMMSCFD" TEXT,
    "valumeMMSCFH" TEXT,
    "valumeMMSCFD2" TEXT,
    "valumeMMSCFH2" TEXT,
    "status" BOOLEAN,
    "active" BOOLEAN,
    "time_num" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "daily_adjustment_nom_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment" ADD CONSTRAINT "daily_adjustment_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment" ADD CONSTRAINT "daily_adjustment_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_nom" ADD CONSTRAINT "daily_adjustment_nom_daily_adjustment_id_fkey" FOREIGN KEY ("daily_adjustment_id") REFERENCES "public"."daily_adjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_nom" ADD CONSTRAINT "daily_adjustment_nom_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_adjustment_nom" ADD CONSTRAINT "daily_adjustment_nom_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
