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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photos = media.filter((m) => m.type === "PHOTO");
  const videos = media.filter((m) => m.type === "VIDEO");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowRight" && lightboxIndex !== null && lightboxIndex < photos.length - 1) {
        setLightboxIndex(lightboxIndex + 1);
      } else if (e.key === "ArrowLeft" && lightboxIndex !== null && lightboxIndex > 0) {
        setLightboxIndex(lightboxIndex - 1);
      }
    },
    [lightboxIndex, photos.length]
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, handleKeyDown]);

  if (!media || media.length === 0) return null;

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
              setLightboxIndex(i);
            }}
            className={`${sizeClass} rounded-lg overflow-hidden border border-border hover:border-brand-accent hover:shadow-sm transition-all flex-shrink-0`}
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
            className={`${sizeClass} rounded-lg overflow-hidden border border-border hover:border-brand-accent hover:shadow-sm transition-all flex-shrink-0 relative bg-brand-primary-light flex items-center justify-center`}
          >
            <svg
              className="w-6 h-6 text-text-secondary"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </a>
        ))}
      </div>

      {/* Lightbox with cycling */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(null);
            }}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors z-10"
            aria-label="Close lightbox"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Previous button */}
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors z-10"
              aria-label="Previous photo"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {lightboxIndex < photos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors z-10"
              aria-label="Next photo"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Image */}
          <img
            src={photos[lightboxIndex].url}
            alt={`Review photo ${lightboxIndex + 1} of ${photos.length}`}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Counter */}
          {photos.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {photos.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
