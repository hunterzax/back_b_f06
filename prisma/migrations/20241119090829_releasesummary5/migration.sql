-- AlterTable
ALTER TABLE "public"."booking_version" ADD COLUMN     "booking_version_comment_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."booking_version_comment" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "booking_version_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."booking_version" ADD CONSTRAINT "booking_version_booking_version_comment_id_fkey" FOREIGN KEY ("booking_version_comment_id") REFERENCES "public"."booking_version_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version_comment" ADD CONSTRAINT "booking_version_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_version_comment" ADD CONSTRAINT "booking_version_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
