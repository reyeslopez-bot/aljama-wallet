ALTER TABLE "ChainTransaction"
  ADD COLUMN "confirmationCount" INT4 NOT NULL DEFAULT 0;

UPDATE "ChainTransaction"
SET
  "status" = CASE
    WHEN "status" IN ('broadcasted', 'pending') THEN 'submitted'
    WHEN "status" = 'confirmed' THEN 'confirmed_soft'
    ELSE "status"
  END,
  "confirmationCount" = CASE
    WHEN "status" = 'confirmed' THEN 1
    ELSE 0
  END;

ALTER TABLE "ChainIndexTransaction"
  ADD COLUMN "confirmationCount" INT4 NOT NULL DEFAULT 0;

UPDATE "ChainIndexTransaction"
SET
  "status" = CASE
    WHEN "status" = 'pending' THEN 'reorged'
    WHEN "status" = 'confirmed' THEN 'confirmed_soft'
    ELSE "status"
  END,
  "confirmationCount" = CASE
    WHEN "status" = 'confirmed' THEN 1
    ELSE 0
  END;
