-- CreateTable
CREATE TABLE "public"."release_summary_confirm_log" (
    "id" SERIAL NOT NULL,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "release_summary_id" INTEGER,
    "mmbtu_d" TEXT,
    "mmscfd_d" TEXT,

    CONSTRAINT "release_summary_confirm_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."release_summary_confirm_log" ADD CONSTRAINT "release_summary_confirm_log_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_confirm_log" ADD CONSTRAINT "release_summary_confirm_log_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_summary_confirm_log" ADD CONSTRAINT "release_summary_confirm_log_release_summary_id_fkey" FOREIGN KEY ("release_summary_id") REFERENCES "public"."release_summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
