"use client";

import { useState, useEffect, useCallback } from "react";

interface MediaItem {
  type: string;
  url: string;
}

interface MediaThumbnailsProps {
  media: MediaItem[];
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
};

export default function MediaThumbnails({ media, size = "md" }: MediaThumbnailsProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightboxUrl(null);
  }, []);

  useEffect(() => {
    if (!lightboxUrl) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxUrl, handleKeyDown]);

  if (!media || media.length === 0) return null;

  const photos = media.filter((m) => m.type === "PHOTO");
  const videos = media.filter((m) => m.type === "VIDEO");
  const sizeClass = SIZE_CLASSES[size];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <button
            key={`photo-${i}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLightboxUrl(photo.url);
            }}
            className={`${sizeClass} rounded-lg overflow-hidden border border-gray-200 hover:border-[#1B3A5C] hover:shadow-sm transition-all flex-shrink-0`}
          >
            <img
              src={photo.url}
              alt={`Review photo ${i + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}

        {videos.map((video, i) => (
          <a
            key={`video-${i}`}
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`${sizeClass} rounded-lg overflow-hidden border border-gray-200 hover:border-[#1B3A5C] hover:shadow-sm transition-all flex-shrink-0 relative bg-[#1B3A5C]/10 flex items-center justify-center`}
          >
            <svg
              className="w-6 h-6 text-[#1B3A5C]/70"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </a>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
            aria-label="Close lightbox"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt="Review photo full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
