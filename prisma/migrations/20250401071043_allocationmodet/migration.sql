-- CreateTable
CREATE TABLE "public"."allocation_mode_type" (
    "id" SERIAL NOT NULL,
    "mode" TEXT,

    CONSTRAINT "allocation_mode_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocation_mode" (
    "id" SERIAL NOT NULL,
    "allocation_mode_type_id" INTEGER,
    "status" BOOLEAN,
    "active" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "allocation_mode_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."allocation_mode" ADD CONSTRAINT "allocation_mode_allocation_mode_type_id_fkey" FOREIGN KEY ("allocation_mode_type_id") REFERENCES "public"."allocation_mode_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_mode" ADD CONSTRAINT "allocation_mode_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocation_mode" ADD CONSTRAINT "allocation_mode_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
