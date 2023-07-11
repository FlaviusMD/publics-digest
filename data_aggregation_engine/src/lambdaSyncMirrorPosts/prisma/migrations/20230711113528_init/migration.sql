-- CreateTable
CREATE TABLE "Publication" (
    "name" TEXT NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "trxHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentSnippet" VARCHAR(350) NOT NULL,
    "fullContentS3URL" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "publicationName" TEXT NOT NULL,
    "metadata" JSON,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_name_key" ON "Publication"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Post_uuid_key" ON "Post"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Post_trxHash_key" ON "Post"("trxHash");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_publicationName_fkey" FOREIGN KEY ("publicationName") REFERENCES "Publication"("name") ON DELETE CASCADE ON UPDATE CASCADE;
