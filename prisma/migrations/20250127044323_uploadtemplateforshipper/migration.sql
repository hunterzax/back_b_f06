-- CreateTable
CREATE TABLE "public"."upload_template_for_shipper" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "group_id" INTEGER,
    "contract_code_id" INTEGER,
    "nomination_type_id" INTEGER,

    CONSTRAINT "upload_template_for_shipper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."upload_template_for_shipper_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "upload_template_for_shipper_id" INTEGER,

    CONSTRAINT "upload_template_for_shipper_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."upload_template_for_shipper_comment" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "upload_template_for_shipper_id" INTEGER,

    CONSTRAINT "upload_template_for_shipper_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper" ADD CONSTRAINT "upload_template_for_shipper_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper" ADD CONSTRAINT "upload_template_for_shipper_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper" ADD CONSTRAINT "upload_template_for_shipper_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper" ADD CONSTRAINT "upload_template_for_shipper_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper" ADD CONSTRAINT "upload_template_for_shipper_nomination_type_id_fkey" FOREIGN KEY ("nomination_type_id") REFERENCES "public"."nomination_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_file" ADD CONSTRAINT "upload_template_for_shipper_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_file" ADD CONSTRAINT "upload_template_for_shipper_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_file" ADD CONSTRAINT "upload_template_for_shipper_file_upload_template_for_shipp_fkey" FOREIGN KEY ("upload_template_for_shipper_id") REFERENCES "public"."upload_template_for_shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_comment" ADD CONSTRAINT "upload_template_for_shipper_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_comment" ADD CONSTRAINT "upload_template_for_shipper_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_template_for_shipper_comment" ADD CONSTRAINT "upload_template_for_shipper_comment_upload_template_for_sh_fkey" FOREIGN KEY ("upload_template_for_shipper_id") REFERENCES "public"."upload_template_for_shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
