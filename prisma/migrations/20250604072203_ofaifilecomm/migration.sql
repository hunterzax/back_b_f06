-- CreateTable
CREATE TABLE "public"."operation_flow_and_instructed_flow_file" (
    "id" SERIAL NOT NULL,
    "url" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "operation_flow_and_instructed_flow_id" INTEGER,

    CONSTRAINT "operation_flow_and_instructed_flow_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."operation_flow_and_instructed_flow_comment" (
    "id" SERIAL NOT NULL,
    "comment" TEXT,
    "create_date" TIMESTAMP(3),
    "update_date" TIMESTAMP(3),
    "create_date_num" INTEGER,
    "update_date_num" INTEGER,
    "create_by" INTEGER,
    "update_by" INTEGER,
    "operation_flow_and_instructed_flow_id" INTEGER,

    CONSTRAINT "operation_flow_and_instructed_flow_comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_file" ADD CONSTRAINT "operation_flow_and_instructed_flow_file_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_file" ADD CONSTRAINT "operation_flow_and_instructed_flow_file_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_file" ADD CONSTRAINT "operation_flow_and_instructed_flow_file_operation_flow_and_fkey" FOREIGN KEY ("operation_flow_and_instructed_flow_id") REFERENCES "public"."operation_flow_and_instructed_flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_comment" ADD CONSTRAINT "operation_flow_and_instructed_flow_comment_create_by_fkey" FOREIGN KEY ("create_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_comment" ADD CONSTRAINT "operation_flow_and_instructed_flow_comment_update_by_fkey" FOREIGN KEY ("update_by") REFERENCES "public"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."operation_flow_and_instructed_flow_comment" ADD CONSTRAINT "operation_flow_and_instructed_flow_comment_operation_flow__fkey" FOREIGN KEY ("operation_flow_and_instructed_flow_id") REFERENCES "public"."operation_flow_and_instructed_flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
