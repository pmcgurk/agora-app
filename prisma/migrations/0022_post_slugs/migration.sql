-- Readable post addresses (/posts/my-first-post). Unique per creator; existing posts get one from their title.
ALTER TABLE "Post" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT
    id,
    "creatorId",
    "createdAt",
    left(
      COALESCE(
        NULLIF(trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')), ''),
        'post'
      ),
      55
    ) AS stem
  FROM "Post"
),
numbered AS (
  SELECT id, stem, row_number() OVER (PARTITION BY "creatorId", stem ORDER BY "createdAt", id) AS n
  FROM base
)
UPDATE "Post" AS post
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.stem ELSE numbered.stem || '-' || numbered.n END
FROM numbered
WHERE post.id = numbered.id;

CREATE UNIQUE INDEX "Post_creatorId_slug_key" ON "Post"("creatorId", "slug");
