"use client";

import { useMemo, useState } from "react";
import { ModelPreview } from "./ModelPreview";
import { ArLauncher } from "./ArLauncher";
import {
  formatDimensions,
  formatPrice,
  priceFor,
  scaledDimensions,
  unitScaleFor,
  type ListingDTO,
} from "@/lib/types";
import type { Dimensions } from "@/lib/three/model";

export function ProductExperience({ listing }: { listing: ListingDTO }) {
  const [colorId, setColorId] = useState(listing.colors[0]?.id);
  const [sizeId, setSizeId] = useState(
    // Default to the size closest to 1x, which is what the seller modelled.
    listing.sizes.reduce((best, current) =>
      Math.abs(current.scale - 1) < Math.abs(best.scale - 1) ? current : best,
    ).id,
  );

  // Filled once the glb is loaded and measured, which is what the stored
  // real-world dimensions are corrected against.
  const [measured, setMeasured] = useState<Dimensions | null>(null);
  const unitScale = unitScaleFor(listing, measured?.height);

  const color = listing.colors.find((c) => c.id === colorId) ?? listing.colors[0];
  const size = listing.sizes.find((s) => s.id === sizeId) ?? listing.sizes[0];

  // Frame the preview camera for the biggest size so switching sizes reads as a
  // real change rather than the camera quietly re-fitting.
  const frameScale = useMemo(
    () => Math.max(...listing.sizes.map((s) => s.scale), 1),
    [listing.sizes],
  );

  const dims = scaledDimensions(listing, size?.scale ?? 1);
  const price = formatPrice(priceFor(listing, color, size), listing.currency);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      <div className="card overflow-hidden">
        <ModelPreview
          src={listing.modelUrl}
          colorHex={color?.useOriginal ? null : (color?.hex ?? null)}
          scale={unitScale * (size?.scale ?? 1)}
          frameScale={unitScale * frameScale}
          onMeasured={setMeasured}
          className="aspect-square w-full lg:aspect-[4/3.4]"
        />
        <p className="border-t border-edge px-4 py-2.5 text-xs text-muted">
          Drag to orbit · scroll to zoom
        </p>
      </div>

      <div>
        <p className="text-xs tracking-wide text-muted uppercase">
          {listing.category} · {listing.material}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{listing.title}</h1>
        <p className="mt-1 text-sm text-muted">by {listing.sellerName}</p>

        <p className="mt-4 text-3xl font-bold">{price}</p>

        {formatDimensions(dims) && (
          <p className="mt-1 text-sm text-muted">{formatDimensions(dims)} at this size</p>
        )}

        {listing.description && (
          <p className="mt-5 text-sm leading-relaxed whitespace-pre-line text-muted">
            {listing.description}
          </p>
        )}

        {/* Colours */}
        <div className="mt-7">
          <h2 className="label">Colour — {color?.name}</h2>
          <div className="flex flex-wrap gap-2.5">
            {listing.colors.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.name}
                aria-label={option.name}
                aria-pressed={option.id === color?.id}
                onClick={() => setColorId(option.id)}
                className={`h-9 w-9 rounded-full border-2 transition ${
                  option.id === color?.id
                    ? "border-brand scale-110"
                    : "border-edge hover:border-muted"
                }`}
                style={{
                  background: option.useOriginal
                    ? "linear-gradient(135deg,#e8ecf3,#8a93a6)"
                    : option.hex,
                }}
              />
            ))}
          </div>
        </div>

        {/* Sizes */}
        <div className="mt-6">
          <h2 className="label">Size</h2>
          <div className="flex flex-wrap gap-2">
            {listing.sizes.map((option) => {
              const optionDims = scaledDimensions(listing, option.scale);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === size?.id}
                  onClick={() => setSizeId(option.id)}
                  className={`chip ${option.id === size?.id ? "chip-on" : "text-muted"}`}
                >
                  {option.label}
                  {optionDims.height != null && (
                    <span className="ml-1.5 text-xs opacity-70">{optionDims.height} cm tall</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* AR */}
        <div className="mt-8">
          {color && size && (
            <ArLauncher
              listing={listing}
              color={color}
              size={size}
              onColorChange={(next) => setColorId(next.id)}
              onSizeChange={(next) => setSizeId(next.id)}
            />
          )}
          <p className="mt-2 text-center text-xs text-muted">
            Placed at true scale, so what you see is the size you would receive.
          </p>
        </div>
      </div>
    </div>
  );
}
