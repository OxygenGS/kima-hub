-- Existing keys remain SHA-256-only. Newly issued app keys may also store
-- an authenticated-encrypted copy for standard Subsonic t/s verification.
ALTER TABLE "ApiKey" ADD COLUMN "tokenSecretEncrypted" TEXT;
