-- CreateTable
CREATE TABLE "public"."account" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "f_t_and_c" BOOLEAN,
    "active" BOOLEAN,
    "status" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "detail" TEXT,
    "address" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "telephone" TEXT,
    "user_id" TEXT,
    "password_gen_origin" TEXT,
    "password_gen_flag" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "time_num" INTEGER,
    "type_account_id" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."type_account" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "type_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account_reason" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "reason" TEXT,
    "status" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "time_num" INTEGER,

    CONSTRAINT "account_reason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account_password_check" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "password" TEXT,
    "create_date" TIMESTAMP(3),
    "time_num" INTEGER,

    CONSTRAINT "account_password_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_login" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "mode_account_id" INTEGER,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,
    "time_num" INTEGER,

    CONSTRAINT "system_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_login_account" (
    "id" SERIAL NOT NULL,
    "system_login_id" INTEGER,
    "account_id" INTEGER,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,
    "time_num" INTEGER,

    CONSTRAINT "system_login_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mode_account" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mode_type" TEXT,
    "color" TEXT,

    CONSTRAINT "mode_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "remark" TEXT,
    "color" TEXT,

    CONSTRAINT "user_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."column_field" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "column_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."column_table" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "column_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."column_table_config" (
    "id" SERIAL NOT NULL,
    "user_type_id" INTEGER,
    "column_table_id" INTEGER,
    "column_field_id" INTEGER,
    "active" BOOLEAN,
    "status" BOOLEAN,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "show_column" BOOLEAN,
    "default_column" BOOLEAN,
    "seq" INTEGER,
    "field_name" TEXT,
    "time_num" INTEGER,

    CONSTRAINT "column_table_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "user_type_id" INTEGER,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_by" INTEGER,
    "update_by" INTEGER,
    "time_num" INTEGER,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_default" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "group_id" INTEGER,

    CONSTRAINT "role_default_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."menus" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "seq" INTEGER,
    "parent" INTEGER,
    "default_f_view" INTEGER,
    "default_f_create" INTEGER,
    "default_f_edit" INTEGER,
    "default_f_import" INTEGER,
    "default_f_export" INTEGER,
    "default_f_approved" INTEGER,
    "default_b_manage" BOOLEAN,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."menus_config" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "menus_id" INTEGER,
    "f_view" INTEGER,
    "f_create" INTEGER,
    "f_edit" INTEGER,
    "f_import" INTEGER,
    "f_export" INTEGER,
    "f_approved" INTEGER,
    "b_manage" BOOLEAN,

    CONSTRAINT "menus_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."division" (
    "id" SERIAL NOT NULL,
    "division_name" TEXT NOT NULL,
    "division_id" TEXT,
    "division_short_name" TEXT,
    "create_date" TIMESTAMP(3),
    "group_id" INTEGER,

    CONSTRAINT "division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."history" (
    "id" SERIAL NOT NULL,
    "reqUser" TEXT,
    "type" TEXT,
    "method" TEXT,
    "value" TEXT,
    "time" TIMESTAMP(3),
    "id_value" INTEGER,
    "time_num" INTEGER,

    CONSTRAINT "history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bank_master" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "name_en" TEXT,
    "short_name" TEXT,
    "url" TEXT,

    CONSTRAINT "bank_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."group" (
    "id" SERIAL NOT NULL,
    "id_name" TEXT,
    "name" TEXT,
    "company_name" TEXT,
    "user_type_id" INTEGER NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "bank_no" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" BOOLEAN,
    "active" BOOLEAN,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "bank_master_id" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "time_num" INTEGER,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account_manage" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "mode_account_id" INTEGER NOT NULL,
    "division_id" INTEGER,
    "user_type_id" INTEGER NOT NULL,
    "group_id" INTEGER,

    CONSTRAINT "account_manage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account_role" (
    "id" SERIAL NOT NULL,
    "account_manage_id" INTEGER,
    "role_id" INTEGER,

    CONSTRAINT "account_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."t_and_c" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "version" INTEGER,
    "active" BOOLEAN,
    "used" BOOLEAN,

    CONSTRAINT "t_and_c_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "public"."account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mode_account_name_key" ON "public"."mode_account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_type_name_key" ON "public"."user_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "column_field_name_key" ON "public"."column_field"("name");

-- CreateIndex
CREATE UNIQUE INDEX "column_table_name_key" ON "public"."column_table"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "public"."role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "menus_name_key" ON "public"."menus"("name");

-- CreateIndex
CREATE UNIQUE INDEX "division_division_name_key" ON "public"."division"("division_name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_master_name_key" ON "public"."bank_master"("name");

-- CreateIndex
CREATE UNIQUE INDEX "group_id_name_key" ON "public"."group"("id_name");

-- CreateIndex
CREATE UNIQUE INDEX "group_name_key" ON "public"."group"("name");

-- AddForeignKey
ALTER TABLE "public"."account" ADD CONSTRAINT "account_type_account_id_fkey" FOREIGN KEY ("type_account_id") REFERENCES "public"."type_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account" ADD CONSTRAINT "account_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account" ADD CONSTRAINT "account_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_reason" ADD CONSTRAINT "account_reason_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_password_check" ADD CONSTRAINT "account_password_check_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login" ADD CONSTRAINT "system_login_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login" ADD CONSTRAINT "system_login_mode_account_id_fkey" FOREIGN KEY ("mode_account_id") REFERENCES "public"."mode_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login" ADD CONSTRAINT "system_login_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login" ADD CONSTRAINT "system_login_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login_account" ADD CONSTRAINT "system_login_account_system_login_id_fkey" FOREIGN KEY ("system_login_id") REFERENCES "public"."system_login"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login_account" ADD CONSTRAINT "system_login_account_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login_account" ADD CONSTRAINT "system_login_account_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_login_account" ADD CONSTRAINT "system_login_account_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."column_table_config" ADD CONSTRAINT "column_table_config_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."column_table_config" ADD CONSTRAINT "column_table_config_column_table_id_fkey" FOREIGN KEY ("column_table_id") REFERENCES "public"."column_table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."column_table_config" ADD CONSTRAINT "column_table_config_column_field_id_fkey" FOREIGN KEY ("column_field_id") REFERENCES "public"."column_field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role" ADD CONSTRAINT "role_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role" ADD CONSTRAINT "role_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role" ADD CONSTRAINT "role_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_default" ADD CONSTRAINT "role_default_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_default" ADD CONSTRAINT "role_default_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."menus_config" ADD CONSTRAINT "menus_config_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."menus_config" ADD CONSTRAINT "menus_config_menus_id_fkey" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."division" ADD CONSTRAINT "division_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group" ADD CONSTRAINT "group_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group" ADD CONSTRAINT "group_bank_master_id_fkey" FOREIGN KEY ("bank_master_id") REFERENCES "public"."bank_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group" ADD CONSTRAINT "group_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group" ADD CONSTRAINT "group_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_manage" ADD CONSTRAINT "account_manage_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_manage" ADD CONSTRAINT "account_manage_mode_account_id_fkey" FOREIGN KEY ("mode_account_id") REFERENCES "public"."mode_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_manage" ADD CONSTRAINT "account_manage_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_manage" ADD CONSTRAINT "account_manage_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "public"."user_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_manage" ADD CONSTRAINT "account_manage_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_role" ADD CONSTRAINT "account_role_account_manage_id_fkey" FOREIGN KEY ("account_manage_id") REFERENCES "public"."account_manage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_role" ADD CONSTRAINT "account_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
