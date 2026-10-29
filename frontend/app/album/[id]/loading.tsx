import { AlbumPageSkeleton } from "@/features/album/components/AlbumPageSkeleton";

/** Keep the album hero and track layout in place while the route is streamed. */
export default function Loading() {
    return <AlbumPageSkeleton />;
}
