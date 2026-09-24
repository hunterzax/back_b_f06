-- CreateTable
CREATE TABLE "public"."nomination_full_json_sheet2" (
    "id" SERIAL NOT NULL,
    "data_temp" TEXT,
    "nomination_version_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "flag_use" BOOLEAN,

    CONSTRAINT "nomination_full_json_sheet2_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json_sheet2" ADD CONSTRAINT "nomination_full_json_sheet2_nomination_version_id_fkey" FOREIGN KEY ("nomination_version_id") REFERENCES "public"."nomination_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json_sheet2" ADD CONSTRAINT "nomination_full_json_sheet2_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."nomination_full_json_sheet2" ADD CONSTRAINT "nomination_full_json_sheet2_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
