-- CreateTable
CREATE TABLE "public"."user_guide" (
    "id" SERIAL NOT NULL,
    "document_name" TEXT,
    "file" TEXT,
    "description" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "active" BOOLEAN,

    CONSTRAINT "user_guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_guide_match" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "user_guide_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,

    CONSTRAINT "user_guide_match_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."user_guide" ADD CONSTRAINT "user_guide_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_guide" ADD CONSTRAINT "user_guide_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_guide_match" ADD CONSTRAINT "user_guide_match_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_guide_match" ADD CONSTRAINT "user_guide_match_user_guide_id_fkey" FOREIGN KEY ("user_guide_id") REFERENCES "public"."user_guide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_guide_match" ADD CONSTRAINT "user_guide_match_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_guide_match" ADD CONSTRAINT "user_guide_match_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
