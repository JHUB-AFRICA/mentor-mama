import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

type StoredImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  /** A private file URL from the API (cover, logo, lesson image). Empty means "no image". */
  src: string | null | undefined;
  /** Shown when there is no image, or when the file can't be loaded (removed, offline, storage down). */
  fallback?: ReactNode;
};

/**
 * An uploaded image that never shows a broken-image icon: if the file is missing or can't be reached, the
 * fallback (an icon or nothing) is shown instead.
 */
export function StoredImage({ src, fallback = null, alt = "", loading = "lazy", decoding = "async", ...props }: StoredImageProps) {
  // Remember which URL failed, so a new URL (a replaced cover carries a new `?v=`) is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return <img {...props} src={src} alt={alt} loading={loading} decoding={decoding} onError={() => setFailedSrc(src)} />;
}
