-- Dedicated instance-wide branding. Never touches existing user or media records.
CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Kima',
    "tagline" TEXT NOT NULL DEFAULT 'Your music, your way',
    "accentColor" TEXT NOT NULL DEFAULT '#fca200',
    "backgroundColor" TEXT NOT NULL DEFAULT '#0a0a0a',
    "logoData" BYTEA,
    "logoContentType" TEXT,
    "faviconData" BYTEA,
    "faviconContentType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandingSettings_pkey" PRIMARY KEY ("id")
);
