-- CreateTable
CREATE TABLE "public"."noti_inapp_read" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "id_noti" INTEGER,
    "create_date" TIMESTAMP(3),
    "create_by" INTEGER,

    CONSTRAINT "noti_inapp_read_pkey" PRIMARY KEY ("id")
);
