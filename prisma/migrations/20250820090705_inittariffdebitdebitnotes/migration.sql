-- AlterTable
ALTER TABLE "public"."tariff_credit_debit_note" ADD COLUMN     "tariff_type_charge_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."tariff_credit_debit_note" ADD CONSTRAINT "tariff_credit_debit_note_tariff_type_charge_id_fkey" FOREIGN KEY ("tariff_type_charge_id") REFERENCES "public"."tariff_type_charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
