-- CreateTable
CREATE TABLE "public"."shipper_contract_point" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER,
    "contract_point_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "shipper_contract_point_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."shipper_contract_point" ADD CONSTRAINT "shipper_contract_point_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipper_contract_point" ADD CONSTRAINT "shipper_contract_point_contract_point_id_fkey" FOREIGN KEY ("contract_point_id") REFERENCES "public"."contract_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipper_contract_point" ADD CONSTRAINT "shipper_contract_point_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipper_contract_point" ADD CONSTRAINT "shipper_contract_point_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
