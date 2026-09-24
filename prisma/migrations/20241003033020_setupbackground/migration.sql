-- CreateTable
CREATE TABLE "public"."setup_background" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "setup_background_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."setup_background" ADD CONSTRAINT "setup_background_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."setup_background" ADD CONSTRAINT "setup_background_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
