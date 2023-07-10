-- CreateTable
CREATE TABLE "Publication" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "trxHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentSnippet" VARCHAR(350) NOT NULL,
    "fullContentS3URL" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "publicationId" INTEGER NOT NULL,
    "metadata" JSON,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_name_key" ON "Publication"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Post_trxHash_key" ON "Post"("trxHash");

-- CreateIndex
CREATE UNIQUE INDEX "Post_cursor_key" ON "Post"("cursor");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
