-- Additive storage for owner-uploaded playlist artwork.
-- Restricts bytes to the owning playlist through ON DELETE CASCADE.
CREATE TABLE "PlaylistCustomCover" (
    "playlistId" TEXT NOT NULL,
    "imageData" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistCustomCover_pkey" PRIMARY KEY ("playlistId")
);

ALTER TABLE "PlaylistCustomCover"
    ADD CONSTRAINT "PlaylistCustomCover_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
