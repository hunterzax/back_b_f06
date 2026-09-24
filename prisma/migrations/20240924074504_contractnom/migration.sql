-- CreateTable
CREATE TABLE "public"."contract_point" (
    "id" SERIAL NOT NULL,
    "contract_point" TEXT,
    "entry_exit_id" INTEGER,
    "zone_id" INTEGER,
    "area_id" INTEGER,
    "contract_point_start_date" TIMESTAMP(3),
    "contract_point_end_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "contract_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contract_nomination_point" (
    "id" SERIAL NOT NULL,
    "nomination_point_id" INTEGER,
    "contract_point_id" INTEGER,
    "nomination_point_start_date" TIMESTAMP(3),
    "nomination_point_end_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "contract_nomination_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nomination_point" (
    "id" SERIAL NOT NULL,
    "nomination_point" TEXT,
    "name" TEXT,
    "entry_exit_id" INTEGER,
    "zone_id" INTEGER,
    "area_id" INTEGER,
    "contract_point_id" INTEGER,
    "maximum_capacity" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "nomination_point_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."contract_point" ADD CONSTRAINT "contract_point_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_point" ADD CONSTRAINT "contract_point_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_point" ADD CONSTRAINT "contract_point_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_point" ADD CONSTRAINT "contract_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_point" ADD CONSTRAINT "contract_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_nomination_point" ADD CONSTRAINT "contract_nomination_point_nomination_point_id_fkey" FOREIGN KEY ("nomination_point_id") REFERENCES "public"."nomination_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_nomination_point" ADD CONSTRAINT "contract_nomination_point_contract_point_id_fkey" FOREIGN KEY ("contract_point_id") REFERENCES "public"."contract_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_nomination_point" ADD CONSTRAINT "contract_nomination_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_nomination_point" ADD CONSTRAINT "contract_nomination_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_entry_exit_id_fkey" FOREIGN KEY ("entry_exit_id") REFERENCES "public"."entry_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_contract_point_id_fkey" FOREIGN KEY ("contract_point_id") REFERENCES "public"."contract_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_point" ADD CONSTRAINT "nomination_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
