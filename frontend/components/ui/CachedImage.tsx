"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { memo, useState } from "react";

interface CachedImageProps extends Omit<ImageProps, "src"> {
    src: string | null | undefined;
    fill?: boolean;
}

const SIZE_PARAM = /([?&])size=\d+/;
// Matches the maximum width accepted by the backend's native cover variant endpoint.
const MAX_COVER_WIDTH = 2048;

/** Use the width selected by Next/Image for our existing authenticated resize endpoint. */
const coverLoader: ImageLoader = ({ src, width }) =>
    src.replace(SIZE_PARAM, `$1size=${Math.min(width, MAX_COVER_WIDTH)}`);

/*
 * The service worker does not cache authenticated API images. Album art
 * stays on the existing protected /api/library/cover-art endpoint and
 * retains its original token, URL and per-request revalidation.
 * Other images retain their prior unoptimized behaviour.
 */
const CachedImage = memo(function CachedImage({
    src,
    alt = "",
    ...props
}: CachedImageProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (!src || failedSrc === src) {
        return null;
    }

    // A fill image needs sizes for the browser to choose a sensible candidate.
    const resizable =
        src.includes("/api/library/cover-art") &&
        SIZE_PARAM.test(src) &&
        (!props.fill || !!props.sizes);

    return (
        <Image
            src={src}
            alt={alt}
            {...(resizable ? { loader: coverLoader } : { unoptimized: true })}
            {...props}
            loading={props.loading ?? (props.priority || props.preload ? undefined : "lazy")}
            onError={(e) => {
                setFailedSrc(src);
                props.onError?.(e);
            }}
        />
    );
});

export { CachedImage };
