/*
  Warnings:

  - You are about to drop the column `edit_emer_email_group_for_event_id` on the `event_document_emer_email_group_for_event` table. All the data in the column will be lost.
  - You are about to drop the `edit_emer_email_group_for_event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `edit_emer_email_group_for_event_match` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" DROP CONSTRAINT "edit_emer_email_group_for_event_create_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" DROP CONSTRAINT "edit_emer_email_group_for_event_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" DROP CONSTRAINT "edit_emer_email_group_for_event_update_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event" DROP CONSTRAINT "edit_emer_email_group_for_event_user_type_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" DROP CONSTRAINT "edit_emer_email_group_for_event_match_create_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" DROP CONSTRAINT "edit_emer_email_group_for_event_match_edit_emer_email_grou_fkey";

-- DropForeignKey
ALTER TABLE "public"."edit_emer_email_group_for_event_match" DROP CONSTRAINT "edit_emer_email_group_for_event_match_update_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" DROP CONSTRAINT "event_document_emer_email_group_for_event_edit_emer_email__fkey";

-- AlterTable
ALTER TABLE "public"."event_document_emer_email_group_for_event" DROP COLUMN "edit_emer_email_group_for_event_id",
ADD COLUMN     "edit_email_group_for_event_id" INTEGER;

-- DropTable
DROP TABLE "public"."edit_emer_email_group_for_event";

-- DropTable
DROP TABLE "public"."edit_emer_email_group_for_event_match";

-- AddForeignKey
ALTER TABLE "public"."event_document_emer_email_group_for_event" ADD CONSTRAINT "event_document_emer_email_group_for_event_edit_email_group_fkey" FOREIGN KEY ("edit_email_group_for_event_id") REFERENCES "public"."edit_email_group_for_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
