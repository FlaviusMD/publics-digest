/*
  Warnings:

  - Added the required column `coverImageURL` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seoTitle` to the `Post` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "coverImageURL" TEXT NOT NULL,
ADD COLUMN     "seoTitle" TEXT NOT NULL;
