-- CreateTable
CREATE TABLE "public"."path_management_config" (
    "id" SERIAL NOT NULL,
    "path_management_id" INTEGER,
    "config_master_path_id" INTEGER,
    "temps" TEXT,
    "start_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,
    "exit_name_temp" TEXT,
    "exit_id_temp" INTEGER,

    CONSTRAINT "path_management_config_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."path_management_config" ADD CONSTRAINT "path_management_config_path_management_id_fkey" FOREIGN KEY ("path_management_id") REFERENCES "public"."path_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."path_management_config" ADD CONSTRAINT "path_management_config_config_master_path_id_fkey" FOREIGN KEY ("config_master_path_id") REFERENCES "public"."config_master_path"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."path_management_config" ADD CONSTRAINT "path_management_config_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."path_management_config" ADD CONSTRAINT "path_management_config_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
