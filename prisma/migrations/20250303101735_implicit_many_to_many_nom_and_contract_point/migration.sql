-- CreateTable
CREATE TABLE "public"."_NomAndContractPoint" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_NomAndContractPoint_AB_unique" ON "public"."_NomAndContractPoint"("A", "B");

-- CreateIndex
CREATE INDEX "_NomAndContractPoint_B_index" ON "public"."_NomAndContractPoint"("B");

-- AddForeignKey
ALTER TABLE "public"."_NomAndContractPoint" ADD CONSTRAINT "_NomAndContractPoint_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."contract_point"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_NomAndContractPoint" ADD CONSTRAINT "_NomAndContractPoint_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."nomination_point"("id") ON DELETE CASCADE ON UPDATE CASCADE;
