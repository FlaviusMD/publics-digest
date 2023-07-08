-- SELECT * FROM "Post";

SELECT * FROM "Post" JOIN "Publication" ON "Post"."publicationId" = "Publication"."id" WHERE "Publication"."name" = 'MirrorXYZ';


-- Delete all entries in Post table
-- DELETE FROM "Post";

-- Delete all entries in Publication table
-- DELETE FROM "Publication";
