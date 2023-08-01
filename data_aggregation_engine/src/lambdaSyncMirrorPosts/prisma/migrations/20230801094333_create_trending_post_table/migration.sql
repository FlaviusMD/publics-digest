-- CreateTable
CREATE TABLE "TrendingPost" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendingPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PostToTrendingPost" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendingPost_uuid_key" ON "TrendingPost"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "_PostToTrendingPost_AB_unique" ON "_PostToTrendingPost"("A", "B");

-- CreateIndex
CREATE INDEX "_PostToTrendingPost_B_index" ON "_PostToTrendingPost"("B");

-- AddForeignKey
ALTER TABLE "_PostToTrendingPost" ADD CONSTRAINT "_PostToTrendingPost_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTrendingPost" ADD CONSTRAINT "_PostToTrendingPost_B_fkey" FOREIGN KEY ("B") REFERENCES "TrendingPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
