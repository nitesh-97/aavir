"use client";

import { useEffect, useRef, useState } from "react";
import { buildUsdz } from "@/lib/three/usdz";
import type { ListingDTO } from "@/lib/types";

type Props = {
  listing: ListingDTO;
  colorHex: string | null;
  colorName: string;
  sizeScale: number;
};

type State = "building" | "ready" | "failed";

/**
 * AR entry point for iOS, which has no WebXR and can only reach AR through
 * Quick Look and a USDZ file.
 *
 * The file is generated ahead of the tap rather than in response to it. Quick
 * Look opens from a genuine activation of an `<a rel="ar">`, and a synthetic
 * click issued after an await has lost that user gesture — so the anchor has
 * to already be pointing at a finished file when the finger lands.
 */
export function QuickLookButton({ listing, colorHex, colorName, sizeScale }: Props) {
  const [state, setState] = useState<State>("building");
  const [href, setHref] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const release = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    setState("building");

    // Colour swatches get tapped in bursts; rebuilding on each one would parse
    // the model several times over for a result nobody waited to see.
    const timer = setTimeout(() => {
      buildUsdz({
        modelUrl: listing.modelUrl,
        colorHex,
        sizeScale,
        baseHeightCm: listing.baseHeightCm,
        material: listing.material,
      })
        .then((blob) => {
          if (cancelled) return;
          release();
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setHref(url);
          setState("ready");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error(error);
          // A seller-supplied USDZ is the backstop when the model will not
          // export — it cannot carry the chosen colour, but it still opens.
          if (listing.usdzUrl) {
            setHref(listing.usdzUrl);
            setState("ready");
          } else {
            setState("failed");
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    listing.modelUrl,
    listing.usdzUrl,
    listing.baseHeightCm,
    listing.material,
    colorHex,
    sizeScale,
  ]);

  // Release the last URL when the component goes away.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  if (state === "failed") {
    return (
      <div className="rounded-xl border border-edge bg-panel-2 p-3 text-xs text-muted">
        <p className="mb-1 font-semibold text-text">AR could not be prepared</p>
        <p>
          This model could not be converted for iOS AR. You can still rotate and inspect it
          above.
        </p>
      </div>
    );
  }

  if (state === "building" || !href) {
    return (
      <div className="btn-ar w-full py-3 text-base opacity-60">
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
        Preparing AR…
      </div>
    );
  }

  const filename = `${listing.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.usdz`;

  return (
    <div>
      {/* Quick Look takes over the anchor only when it wraps an <img>. */}
      <a rel="ar" href={href} download={filename} className="btn-ar w-full py-3 text-base">
        <img src="/ar-badge.svg" alt="" width={1} height={1} className="h-0 w-0" />
        View in your room
      </a>
      <p className="mt-2 text-xs text-muted">
        Opens in iOS AR Quick Look, built for {colorName} at this size. Drag to move,
        twist with two fingers to turn.
      </p>
    </div>
  );
}
