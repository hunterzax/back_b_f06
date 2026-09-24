-- CreateTable
CREATE TABLE "public"."hv_type" (
    "id" SERIAL NOT NULL,
    "type" TEXT,
    "color" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "hv_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."hv_for_peration_flow_and_instructed_flow" (
    "id" SERIAL NOT NULL,
    "start_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "hv_type_id" INTEGER,
    "group_id" INTEGER,
    "metering_point_id" INTEGER,

    CONSTRAINT "hv_for_peration_flow_and_instructed_flow_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."hv_type" ADD CONSTRAINT "hv_type_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_type" ADD CONSTRAINT "hv_type_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_hv_type_id_fkey" FOREIGN KEY ("hv_type_id") REFERENCES "public"."hv_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hv_for_peration_flow_and_instructed_flow" ADD CONSTRAINT "hv_for_peration_flow_and_instructed_flow_metering_point_id_fkey" FOREIGN KEY ("metering_point_id") REFERENCES "public"."metering_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
