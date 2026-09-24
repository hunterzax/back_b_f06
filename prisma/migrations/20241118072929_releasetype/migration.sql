-- CreateTable
CREATE TABLE "public"."release_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "color" TEXT,

    CONSTRAINT "release_type_pkey" PRIMARY KEY ("id")
);
