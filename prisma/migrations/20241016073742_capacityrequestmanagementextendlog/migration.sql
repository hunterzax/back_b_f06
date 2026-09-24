-- CreateTable
CREATE TABLE "public"."book_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "version" TEXT,
    "file_json" JSONB,
    "file_string" TEXT,
    "contract_code_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "ref" INTEGER,

    CONSTRAINT "book_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comment_book_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "book_capacity_request_management_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "ref" INTEGER,

    CONSTRAINT "comment_book_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."log_book_capacity_request_management" (
    "id" SERIAL NOT NULL,
    "version" TEXT,
    "file_json" JSONB,
    "file_string" TEXT,
    "book_capacity_request_management_id" INTEGER,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "ref" INTEGER,
    "comment_book_capacity_request_management" TEXT NOT NULL,

    CONSTRAINT "log_book_capacity_request_management_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."book_capacity_request_management" ADD CONSTRAINT "book_capacity_request_management_contract_code_id_fkey" FOREIGN KEY ("contract_code_id") REFERENCES "public"."contract_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."book_capacity_request_management" ADD CONSTRAINT "book_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."book_capacity_request_management" ADD CONSTRAINT "book_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comment_book_capacity_request_management" ADD CONSTRAINT "comment_book_capacity_request_management_book_capacity_req_fkey" FOREIGN KEY ("book_capacity_request_management_id") REFERENCES "public"."book_capacity_request_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comment_book_capacity_request_management" ADD CONSTRAINT "comment_book_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comment_book_capacity_request_management" ADD CONSTRAINT "comment_book_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_book_capacity_request_management" ADD CONSTRAINT "log_book_capacity_request_management_book_capacity_request_fkey" FOREIGN KEY ("book_capacity_request_management_id") REFERENCES "public"."book_capacity_request_management"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_book_capacity_request_management" ADD CONSTRAINT "log_book_capacity_request_management_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_book_capacity_request_management" ADD CONSTRAINT "log_book_capacity_request_management_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
