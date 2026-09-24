-- CreateTable
CREATE TABLE "public"."path_management" (
    "id" SERIAL NOT NULL,
    "version" TEXT,
    "start_date" TIMESTAMP(3),
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "path_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."path_management" ADD CONSTRAINT "path_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."path_management" ADD CONSTRAINT "path_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
