-- CreateTable
CREATE TABLE "public"."config_master_path" (
    "id" SERIAL NOT NULL,
    "path_no" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "revised_capacity_path_edges_id" INTEGER,

    CONSTRAINT "config_master_path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revised_capacity_path" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "config_master_path_id" INTEGER,
    "area_id" INTEGER,
    "revised_capacity_path_type_id" INTEGER,

    CONSTRAINT "revised_capacity_path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revised_capacity_path_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,

    CONSTRAINT "revised_capacity_path_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revised_capacity_path_edges" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,
    "source_id" INTEGER,
    "target_id" INTEGER,

    CONSTRAINT "revised_capacity_path_edges_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."config_master_path" ADD CONSTRAINT "config_master_path_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."config_master_path" ADD CONSTRAINT "config_master_path_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."config_master_path" ADD CONSTRAINT "config_master_path_revised_capacity_path_edges_id_fkey" FOREIGN KEY ("revised_capacity_path_edges_id") REFERENCES "public"."revised_capacity_path_edges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path" ADD CONSTRAINT "revised_capacity_path_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path" ADD CONSTRAINT "revised_capacity_path_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path" ADD CONSTRAINT "revised_capacity_path_config_master_path_id_fkey" FOREIGN KEY ("config_master_path_id") REFERENCES "public"."config_master_path"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path" ADD CONSTRAINT "revised_capacity_path_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path" ADD CONSTRAINT "revised_capacity_path_revised_capacity_path_type_id_fkey" FOREIGN KEY ("revised_capacity_path_type_id") REFERENCES "public"."revised_capacity_path_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path_edges" ADD CONSTRAINT "revised_capacity_path_edges_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path_edges" ADD CONSTRAINT "revised_capacity_path_edges_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path_edges" ADD CONSTRAINT "revised_capacity_path_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revised_capacity_path_edges" ADD CONSTRAINT "revised_capacity_path_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
