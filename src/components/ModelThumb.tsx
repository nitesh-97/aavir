"use client";

import { useEffect, useRef, useState } from "react";
import { renderThumbnail } from "@/lib/three/thumbnailer";

/**
 * Fallback thumbnail for listings with no stored poster. Rendering starts only
 * once the card is near the viewport, and the shared thumbnailer keeps the work
 * to one model at a time.
 */
export function ModelThumb({ src, alt }: { src: string; alt: string }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        renderThumbnail(src).then((result) => {
          if (cancelled) return;
          if (result) setDataUrl(result);
          else setFailed(true);
        });
      },
      { rootMargin: "300px" },
    );

    observer.observe(holder);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src]);

  return (
    <div ref={holderRef} className="h-full w-full">
      {dataUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={dataUrl} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-panel-2 to-panel">
          <span className={`text-4xl opacity-30 ${failed ? "" : "animate-pulse"}`}>◈</span>
        </div>
      )}
    </div>
  );
}
